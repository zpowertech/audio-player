import { SilkError } from './errors.js';

export type SilkBytes = Uint8Array | ArrayBuffer;

export function asBytes(input: SilkBytes): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new SilkError('expected Uint8Array or ArrayBuffer');
}

const headers = ['\x02#!SILK_V3', '#!SILK_V3', '!SILK_V3'];

export function headerLength(bytes: Uint8Array): number {
  for (const header of headers) {
    if (bytes.length >= header.length && [...header].every((char, index) => bytes[index] === char.charCodeAt(0))) {
      return header.length;
    }
  }
  return 0;
}

export function containerStart(bytes: Uint8Array): number {
  const start = headerLength(bytes);
  if (!start) throw new SilkError('invalid SILK header');
  return start;
}

/** Read one length-prefixed packet, or an optional signed -1 EOF marker. */
export function nextPacket(bytes: Uint8Array, offset: number): { packet: Uint8Array; next: number } | null {
  if (offset === bytes.length) return null;
  if (offset + 2 > bytes.length) throw new SilkError(`truncated SILK packet length at byte ${offset}`);
  const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getInt16(0, true);
  if (length === -1) {
    if (offset + 2 !== bytes.length) throw new SilkError('unexpected data after SILK end marker');
    return null;
  }
  if (length <= 0) throw new SilkError(`invalid SILK packet length ${length} at byte ${offset}`);
  const next = offset + 2 + length;
  if (next > bytes.length) throw new SilkError(`truncated SILK packet at byte ${offset}`);
  return { packet: bytes.subarray(offset + 2, next), next };
}

export function walkPackets(bytes: Uint8Array, visit?: (packet: Uint8Array) => void): void {
  let offset = containerStart(bytes);
  let count = 0;
  for (;;) {
    const entry = nextPacket(bytes, offset);
    if (!entry) break;
    visit?.(entry.packet);
    offset = entry.next;
    count++;
  }
  if (!count) throw new SilkError('empty SILK container');
}
