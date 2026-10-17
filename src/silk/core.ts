import { asBytes, containerStart, nextPacket, walkPackets, type SilkBytes } from './container.js';
import { guard, SilkError } from './errors.js';

interface SilkExports {
  memory: WebAssembly.Memory;
  silk_alloc(length: number): number;
  silk_free(ptr: number, length: number): void;
  silk_free_buffer(header: number): void;
  silk_last_error(outLength: number): number;
  silk_decode(ptr: number, length: number, outRate: number): number;
  silk_decode_wav(ptr: number, length: number): number;
  silk_stream_new(sampleRate: number): number;
  silk_stream_free(handle: number): void;
  silk_stream_sample_rate(handle: number): number;
  silk_stream_packets(handle: number): number;
  silk_stream_decode(handle: number, ptr: number, length: number): number;
}

export interface DecodedAudio {
  /** Owned PCM copy, independent of WASM memory and subsequent decodes. */
  samples: Int16Array<ArrayBuffer>;
  sampleRate: number;
  duration: number;
  toFloat32(): Float32Array<ArrayBuffer>;
}

/** A reusable decoder with its own WASM instance. Obtain one with `loadSilk()`. */
export interface Silk {
  decode(bytes: SilkBytes): DecodedAudio;
  /** Decode into a complete 16-bit mono audio/wav Blob. */
  decodeToWav(bytes: SilkBytes): Blob;
  /** Split in one pass. Views share the input; do not mutate it while decoding. */
  packets(bytes: SilkBytes): Uint8Array[];
  /** Zero/default follows the native rate; an explicit rate preserves resampler history across packets. */
  stream(sampleRate?: number): SilkStream;
  /** Release scratch memory. This decoder and its streams remain usable. */
  dispose(): void;
}

/** Independent packet decoder. Dispose when finished, including on error. */
export interface SilkStream {
  decode(packet: SilkBytes): Int16Array<ArrayBuffer>;
  /** Walk the same complete container, copying only the current packet into WASM. */
  decodeNext(bytes: SilkBytes): Int16Array<ArrayBuffer>;
  /** Valid after the first packet has been decoded. */
  readonly sampleRate: number;
  readonly packetsSeen: number;
  /** Idempotent. Getters and decode methods throw after disposal. */
  dispose(): void;
}

function float32From(samples: Int16Array): Float32Array<ArrayBuffer> {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] / 32768;
  return out;
}

export function createSilk(instance: WebAssembly.Instance): Silk {
  return new SilkDecoder(instance);
}

class SilkDecoder implements Silk {
  readonly #exports: SilkExports;
  #scratchPtr = 0;

  constructor(instance: WebAssembly.Instance) {
    this.#exports = instance.exports as unknown as SilkExports;
    const functions: (keyof Omit<SilkExports, 'memory'>)[] = [
      'silk_alloc', 'silk_free', 'silk_free_buffer', 'silk_last_error', 'silk_decode', 'silk_decode_wav',
      'silk_stream_new', 'silk_stream_free', 'silk_stream_sample_rate', 'silk_stream_packets', 'silk_stream_decode',
    ];
    if (!(this.#exports.memory instanceof WebAssembly.Memory) || functions.some((key) => typeof this.#exports[key] !== 'function')) {
      throw new SilkError('WASM module does not export the SILK decoder ABI');
    }
  }

  packets(input: SilkBytes): Uint8Array[] {
    return guard('failed to parse SILK packets', () => {
      const packets: Uint8Array[] = [];
      walkPackets(asBytes(input), (packet) => packets.push(packet));
      return packets;
    });
  }

  decode(input: SilkBytes): DecodedAudio {
    return guard('SILK decoding failed', () => {
      const bytes = asBytes(input);
      walkPackets(bytes);
      return this.#withBytes(bytes, (ptr, length) => {
        const ratePtr = this.#scratchU32();
        const header = this.#exports.silk_decode(ptr, length, ratePtr);
        if (!header) throw this.#lastError();
        const samples = this.#takeI16(header);
        const sampleRate = this.#readU32(ratePtr);
        return { samples, sampleRate, duration: samples.length / sampleRate, toFloat32: () => float32From(samples) };
      });
    });
  }

  decodeToWav(input: SilkBytes): Blob {
    return guard('SILK decoding failed', () => {
      const bytes = asBytes(input);
      walkPackets(bytes);
      return this.#withBytes(bytes, (ptr, length) => {
        const header = this.#exports.silk_decode_wav(ptr, length);
        if (!header) throw this.#lastError();
        return new Blob([this.#takeBytes(header)], { type: 'audio/wav' });
      });
    });
  }

  stream(sampleRate = 0): SilkStream {
    let handle = guard('failed to create SILK stream', () => this.#exports.silk_stream_new(sampleRate));
    if (!handle) throw new SilkError('out of memory creating SILK stream');
    let cursor: number | undefined;
    let container: Uint8Array | undefined;
    const decoder = this;
    const assertLive = (): void => {
      if (!handle) throw new SilkError('stream decoder has been disposed');
    };
    const decode = (input: SilkBytes): Int16Array<ArrayBuffer> => {
      assertLive();
      return guard('SILK packet decoding failed', () => decoder.#withBytes(asBytes(input), (ptr, length) => {
        const header = decoder.#exports.silk_stream_decode(handle, ptr, length);
        if (!header) throw decoder.#lastError();
        return decoder.#takeI16(header);
      }));
    };
    return {
      get sampleRate() {
        assertLive();
        return guard('failed to read SILK sample rate', () => decoder.#exports.silk_stream_sample_rate(handle));
      },
      get packetsSeen() {
        assertLive();
        return guard('failed to read SILK packet count', () => decoder.#exports.silk_stream_packets(handle));
      },
      decode,
      decodeNext(input) {
        assertLive();
        return guard('SILK packet decoding failed', () => {
          const bytes = asBytes(input);
          if (cursor === undefined) {
            cursor = containerStart(bytes);
            container = bytes;
          } else if (container!.buffer !== bytes.buffer || container!.byteOffset !== bytes.byteOffset || container!.length !== bytes.length) {
            throw new SilkError('decodeNext requires the same container; create a new stream for another file');
          }
          const entry = nextPacket(bytes, cursor);
          if (!entry) {
            if (!this.packetsSeen) throw new SilkError('empty SILK container');
            cursor = bytes.length;
            return new Int16Array(0);
          }
          const pcm = decode(entry.packet);
          cursor = entry.next;
          return pcm;
        });
      },
      dispose() {
        if (handle) {
          const previous = handle;
          handle = 0;
          container = undefined;
          guard('failed to dispose SILK stream', () => decoder.#exports.silk_stream_free(previous));
        }
      },
    };
  }

  dispose(): void {
    if (this.#scratchPtr) {
      guard('failed to dispose SILK scratch memory', () => this.#exports.silk_free(this.#scratchPtr, 16));
      this.#scratchPtr = 0;
    }
  }

  #withBytes<T>(bytes: Uint8Array, fn: (ptr: number, length: number) => T): T {
    const ptr = this.#exports.silk_alloc(bytes.length || 1);
    if (!ptr) throw new SilkError('out of memory allocating SILK input');
    try {
      new Uint8Array(this.#exports.memory.buffer, ptr, bytes.length).set(bytes);
      return fn(ptr, bytes.length);
    } finally {
      this.#exports.silk_free(ptr, bytes.length || 1);
    }
  }

  #scratchU32(): number {
    if (!this.#scratchPtr) this.#scratchPtr = this.#exports.silk_alloc(16);
    if (!this.#scratchPtr) throw new SilkError('out of memory allocating SILK scratch');
    return this.#scratchPtr;
  }

  #readU32(ptr: number): number {
    // Re-read memory.buffer: WASM growth can detach an earlier view.
    return new DataView(this.#exports.memory.buffer).getUint32(ptr, true);
  }

  #takeI16(header: number): Int16Array<ArrayBuffer> {
    try {
      const dataPtr = this.#readU32(header);
      const length = this.#readU32(header + 4);
      const samples = new Int16Array(length);
      const view = new DataView(this.#exports.memory.buffer, dataPtr, length * 2);
      for (let i = 0; i < length; i++) samples[i] = view.getInt16(i * 2, true);
      return samples;
    } finally {
      this.#exports.silk_free_buffer(header);
    }
  }

  #takeBytes(header: number): Uint8Array<ArrayBuffer> {
    try {
      return new Uint8Array(this.#exports.memory.buffer, this.#readU32(header), this.#readU32(header + 4)).slice();
    } finally {
      this.#exports.silk_free_buffer(header);
    }
  }

  #lastError(): SilkError {
    const header = this.#exports.silk_last_error(0);
    const message = header ? new TextDecoder().decode(this.#takeBytes(header)) : 'unknown decoder error';
    return new SilkError(message, { cause: new Error(message) });
  }
}
