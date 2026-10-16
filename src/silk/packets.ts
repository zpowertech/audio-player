import { PlayerError } from '../errors.js';

const signatures = ['\x02#!SILK_V3', '#!SILK_V3', '!SILK_V3'].map(s => Uint8Array.from(s, c => c.charCodeAt(0)));
/** Incremental framer: at most one header/packet is copied, never the whole input. */
export class PacketFramer {
  private header: number[] = [];
  private hasHeader = false;
  private lengthBytes: number[] = [];
  private body?: Uint8Array;
  private used = 0;
  private ended = false;
  private count = 0;
  *push(chunk: Uint8Array): Generator<Uint8Array> {
    let i = 0;
    while (i < chunk.length) {
      if (this.ended) throw new PlayerError('DECODE', 'Unexpected data after SILK end marker');
      if (!this.hasHeader) {
        this.header.push(chunk[i++]);
        const candidates = signatures.filter(h => this.header.length <= h.length && this.header.every((v, j) => v === h[j]));
        if (!candidates.length) throw new PlayerError('NOT_SUPPORTED', 'Input is not a SILK v3 container');
        if (candidates.some(h => h.length === this.header.length)) this.hasHeader = true;
        continue;
      }
      if (!this.body) {
        this.lengthBytes.push(chunk[i++]);
        if (this.lengthBytes.length < 2) continue;
        const length = (this.lengthBytes[0] | this.lengthBytes[1] << 8) << 16 >> 16;
        this.lengthBytes = [];
        if (length === -1) { this.ended = true; continue; }
        if (length <= 0 || length > 1024) throw new PlayerError('DECODE', `Invalid SILK packet length: ${length}`);
        this.body = new Uint8Array(length);
        this.used = 0;
      }
      const take = Math.min(this.body.length - this.used, chunk.length - i);
      this.body.set(chunk.subarray(i, i + take), this.used);
      i += take; this.used += take;
      if (this.used === this.body.length) {
        const packet = this.body;
        this.body = undefined;
        this.count++;
        yield packet;
      }
    }
  }
  finish(): void {
    if (!this.hasHeader) throw new PlayerError('DECODE', 'Truncated SILK header');
    if (this.body || this.lengthBytes.length) throw new PlayerError('DECODE', 'Truncated SILK packet');
    if (!this.count) throw new PlayerError('DECODE', 'Empty SILK container');
  }
}

export class PacketCache {
  private packets: Uint8Array[] = [];
  private size = 0;
  private overflow = false;
  complete = false;
  constructor(private limit = 32 * 1024 * 1024) {}
  add(packet: Uint8Array): void {
    if (this.overflow) return;
    this.size += packet.length;
    if (this.size > this.limit) { this.packets = []; this.overflow = true; return; }
    this.packets.push(packet);
  }
  finish(): void { this.complete = !this.overflow; }
  values(): readonly Uint8Array[] { return this.packets; }
}

export async function* networkPackets(url: string, signal: AbortSignal, cache: PacketCache): AsyncGenerator<Uint8Array> {
  let response: Response;
  try { response = await fetch(url, { signal }); }
  catch (cause) { signal.throwIfAborted(); throw new PlayerError('NETWORK', 'Failed to fetch SILK audio (check URL and CORS)', cause); }
  if (!response.ok) throw new PlayerError('NETWORK', `Audio request failed: HTTP ${response.status}`);
  if (!response.body) throw new PlayerError('NOT_SUPPORTED', 'ReadableStream response bodies are required for SILK playback');
  const reader = response.body.getReader();
  const framer = new PacketFramer();
  try {
    for (;;) {
      signal.throwIfAborted();
      let result: ReadableStreamReadResult<Uint8Array>;
      try { result = await reader.read(); }
      catch (cause) { signal.throwIfAborted(); throw new PlayerError('NETWORK', 'Audio response interrupted', cause); }
      if (result.done) break;
      for (const packet of framer.push(result.value)) { cache.add(packet); yield packet; }
    }
    framer.finish();
    cache.finish();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
