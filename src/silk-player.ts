import { aborted, deferred, normalize, PlayerError, type Deferred } from './errors.js';
import { loadSilk } from './silk/loader.js';
import { networkPackets, PacketCache } from './silk/packets.js';
import type { Backend, Update } from './types.js';

interface PCM { samples: Float32Array<ArrayBuffer>; rate: number; start: number; end: number; }
interface Scheduled { pcm: PCM; node: AudioBufferSourceNode; start: number; end: number; }
export interface PreparedContext { context: AudioContext; ready: Promise<void>; }
export function resumeContext(context: AudioContext): Promise<void> {
  if (context.state === 'running') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new PlayerError('AUTOPLAY_BLOCKED', 'AudioContext did not resume; call play() from a user gesture')), 1500);
    context.resume().then(() => { clearTimeout(timeout); resolve(); }, cause => { clearTimeout(timeout); reject(normalize(cause)); });
  });
}
export function prepareContext(): PreparedContext {
  if (typeof AudioContext === 'undefined') throw new PlayerError('NOT_SUPPORTED', 'Web Audio is not available');
  const context = new AudioContext();
  const ready = resumeContext(context);
  // An auto/native attempt may succeed without consuming this promise.
  void ready.catch(() => {});
  return { context, ready };
}

export class SilkBackend implements Backend {
  private context: AudioContext;
  private timer: ReturnType<typeof setInterval>;
  private queue: PCM[] = [];
  private scheduled: Scheduled[] = [];
  private pending?: Deferred<void>;
  private gate?: Deferred<void>;
  private abort?: AbortController;
  private cycle = 0;
  private cache = new PacketCache();
  private position = 0;
  private duration: number | null = null;
  private paused = true;
  private dead = false;
  private failed = false;
  private eof = false;
  private started = false;
  private seeking = false;
  private hasLoad = false;
  private lastProgress = 0;
  private closePromise?: Promise<void>;
  constructor(private url: string, private update: Update, prepared = prepareContext()) {
    this.context = prepared.context;
    this.timer = setInterval(() => this.pump(), 25);
  }
  play(time?: number): Promise<void> {
    this.pending?.reject(aborted());
    const request = this.pending = deferred<void>();
    this.paused = false;
    if (!this.hasLoad || time !== undefined) {
      const target = time ?? 0;
      this.seeking = target > 0;
      if (!this.hasLoad || !this.reusePCM(target)) this.load(target);
    }
    const ready = resumeContext(this.context);
    void ready.then(() => {
      if (this.dead || this.pending !== request) return;
      if (this.paused) { void this.context.suspend().catch(() => {}); return; }
      this.wake(); this.pump();
    }, error => {
      if (this.pending === request) this.fail(error);
    });
    this.wake();
    return request.promise;
  }
  pause(): void {
    if (this.dead) return;
    this.position = this.clock();
    this.paused = true;
    this.pending?.reject(aborted()); this.pending = undefined;
    void this.context.suspend().then(() => {
      if (this.paused && !this.dead) {
        this.position = this.clock();
        this.update({ status: 'paused', currentTime: this.position });
      }
    }).catch(() => {});
    this.update({ status: 'paused', currentTime: this.position });
  }
  private clock(): number {
    const now = this.context.currentTime;
    let position = this.position;
    for (const segment of this.scheduled) {
      if (now < segment.start) break;
      position = segment.pcm.start + Math.min(now - segment.start, segment.pcm.end - segment.pcm.start);
    }
    return position;
  }
  private stopNodes(): void {
    const previous = this.scheduled;
    this.scheduled = [];
    for (const { node } of previous) { node.onended = null; node.stop(); node.disconnect(); }
  }
  private reusePCM(target: number): boolean {
    const available = [...this.scheduled.map(s => s.pcm), ...this.queue];
    if (!available.length || target < available[0].start || target >= available[available.length - 1].end) return false;
    this.stopNodes();
    this.queue = available.filter(p => p.end > target).map(p => {
      if (p.start >= target) return p;
      const offset = Math.floor((target - p.start) * p.rate + 1e-7);
      return { ...p, samples: p.samples.slice(offset), start: p.start + offset / p.rate };
    });
    this.position = this.queue[0].start;
    this.started = false;
    this.update({ currentTime: this.position, status: 'seeking' });
    return true;
  }
  private load(target: number): void {
    this.abort?.abort(); this.wake();
    this.stopNodes(); this.queue = [];
    const cycle = ++this.cycle;
    const controller = this.abort = new AbortController();
    const cache = this.cache.complete ? this.cache : this.cache = new PacketCache();
    this.hasLoad = true; this.eof = false; this.started = false;
    this.position = target;
    this.update({ currentTime: target, duration: this.duration, status: target ? 'seeking' : 'loading' });
    void this.produce(target, cycle, controller.signal, cache);
  }
  private async produce(target: number, cycle: number, signal: AbortSignal, cache: PacketCache): Promise<void> {
    let silk: Awaited<ReturnType<typeof loadSilk>> | undefined;
    let stream: ReturnType<NonNullable<typeof silk>['stream']> | undefined;
    try {
      try { silk = await loadSilk(); }
      catch (cause) { throw new PlayerError('WASM_INIT', 'Unable to initialize the SILK decoder', cause); }
      signal.throwIfAborted();
      stream = silk.stream();
      const packets = cache.complete ? cache.values() : networkPackets(this.url, signal, cache);
      let decodedTime = 0;
      let deadline = performance.now() + 4;
      for await (const packet of packets) {
        signal.throwIfAborted();
        while (this.paused || this.bufferedSeconds() >= 2) {
          this.gate ??= deferred<void>();
          await this.gate.promise;
          signal.throwIfAborted();
        }
        const samples = stream.decode(packet);
        const rate = stream.sampleRate;
        const start = decodedTime;
        decodedTime += samples.length / rate;
        if (decodedTime > target) {
          const offset = Math.max(0, Math.floor((target - start) * rate + 1e-7));
          if (offset >= samples.length) continue;
          const floats = new Float32Array(samples.length - offset);
          for (let i = offset; i < samples.length; i++) floats[i - offset] = samples[i] / 32768;
          this.queue.push({ samples: floats, rate, start: start + offset / rate, end: decodedTime });
          this.pump();
        }
        if (performance.now() >= deadline) {
          await new Promise(resolve => setTimeout(resolve, 0));
          signal.throwIfAborted();
          deadline = performance.now() + 4;
        }
      }
      signal.throwIfAborted();
      this.duration = decodedTime; this.eof = true;
      this.update({ duration: decodedTime });
      this.pump();
    } catch (cause) {
      if (!signal.aborted && cycle === this.cycle && !this.dead) this.fail(cause);
    } finally {
      stream?.dispose(); silk?.dispose();
    }
  }
  private bufferedSeconds(): number {
    const end = this.queue.at(-1)?.end ?? this.scheduled.at(-1)?.pcm.end ?? this.position;
    return Math.max(0, end - this.clock());
  }
  private wake(): void { const gate = this.gate; this.gate = undefined; gate?.resolve(); }
  private pump(): void {
    if (this.dead || this.failed || this.paused) return;
    if (this.bufferedSeconds() < 1) this.wake();
    if (this.context.state !== 'running') {
      if (this.started) this.update({ status: 'buffering', currentTime: this.clock() });
      return;
    }
    const now = this.context.currentTime;
    this.position = this.clock();
    const active = this.scheduled.some(s => s.start <= now && s.end > now);
    const queueDuration = this.queue.reduce((sum, p) => sum + p.samples.length / p.rate, 0);
    const canSchedule = active || this.scheduled.some(s => s.end > now) || queueDuration >= .2 - 1e-7 || this.eof;
    if (canSchedule) {
      while (this.queue.length && (this.scheduled.at(-1)?.end ?? now) - now < 1) {
        const records: PCM[] = [];
        const rate = this.queue[0].rate;
        let length = 0;
        while (this.queue.length && this.queue[0].rate === rate && length / rate < .1 - 1e-7) {
          const pcm = this.queue.shift()!; records.push(pcm); length += pcm.samples.length;
        }
        const floats = new Float32Array(length);
        let offset = 0;
        for (const record of records) { floats.set(record.samples, offset); offset += record.samples.length; }
        const pcm: PCM = { samples: floats, rate, start: records[0].start, end: records.at(-1)!.end };
        const buffer = this.context.createBuffer(1, length, rate);
        buffer.copyToChannel(floats, 0);
        const node = this.context.createBufferSource();
        node.buffer = buffer; node.connect(this.context.destination);
        const start = Math.max(now + (this.scheduled.length ? 0 : .025), this.scheduled.at(-1)?.end ?? 0);
        const entry: Scheduled = { pcm, node, start, end: start + length / rate };
        this.scheduled.push(entry);
        node.onended = () => {
          const i = this.scheduled.indexOf(entry);
          if (i < 0 || this.dead) return;
          this.position = Math.max(this.position, pcm.end);
          this.scheduled.splice(i, 1); node.disconnect();
          this.wake(); this.pump();
        };
        node.start(start);
      }
    }
    if (active) {
      this.started = true; this.seeking = false;
      this.update({ status: 'playing', error: null });
      this.pending?.resolve(); this.pending = undefined;
    } else if (!this.scheduled.length && !this.queue.length && this.eof) {
      this.position = this.duration!;
      this.update({ status: 'ended', currentTime: this.position, duration: this.duration });
      this.pending?.resolve(); this.pending = undefined;
      this.paused = true;
      void this.context.suspend().catch(() => {});
    } else if (!active && !this.scheduled.some(s => s.start > now)) {
      this.update({ status: this.seeking ? 'seeking' : this.started ? 'buffering' : 'loading', currentTime: this.position });
    }
    if (performance.now() - this.lastProgress >= 250) {
      this.lastProgress = performance.now();
      this.update({ currentTime: this.position });
    }
  }
  private fail(cause: unknown): void {
    this.failed = true; this.position = this.clock();
    this.abort?.abort(); this.wake(); this.stopNodes(); this.queue = [];
    void this.context.suspend().catch(() => {});
    const error = normalize(cause);
    this.pending?.reject(error); this.pending = undefined;
    this.update({ status: 'error', error, currentTime: this.position });
  }
  dispose(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.dead = true; this.abort?.abort(); this.wake();
    clearInterval(this.timer); this.stopNodes(); this.queue = []; this.cache = new PacketCache();
    this.pending?.reject(aborted()); this.pending = undefined;
    this.closePromise = this.context.close().catch(() => {});
    return this.closePromise;
  }
}
