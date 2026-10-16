import { aborted, deferred, normalize, PlayerError, type Deferred } from './errors.js';
import type { Backend, Update } from './types.js';

export class NativeBackend implements Backend {
  private audio = new Audio();
  private listeners: [string, EventListener][] = [];
  private pending?: Deferred<void>;
  private target?: number;
  private desired = false;
  private dead = false;
  private started = false;
  constructor(url: string, private update: Update) {
    const on = (name: string, callback: () => void) => {
      const listener = () => { if (!this.dead) callback(); };
      this.audio.addEventListener(name, listener);
      this.listeners.push([name, listener]);
    };
    on('loadedmetadata', () => { this.applyTarget(); this.progress(); this.check(); });
    on('durationchange', () => this.progress());
    on('timeupdate', () => this.progress());
    on('playing', () => this.check());
    on('canplay', () => this.check());
    on('seeked', () => this.check());
    on('seeking', () => { if (this.desired) this.update({ status: 'seeking' }); });
    on('waiting', () => { if (this.desired) this.update({ status: this.started ? 'buffering' : 'loading' }); });
    on('ended', () => this.end());
    on('error', () => {
      const cause = this.audio.error;
      const code = cause?.code === 4 ? 'NOT_SUPPORTED' : cause?.code === 2 ? 'NETWORK' : 'DECODE';
      const error = new PlayerError(code, cause?.message || 'Native audio playback failed', cause);
      if (this.pending) { this.pending.reject(error); this.pending = undefined; }
      else if (this.desired) this.update({ status: 'error', error });
    });
    this.audio.preload = 'auto';
    this.audio.src = url;
  }
  play(time?: number): Promise<void> {
    this.pending?.reject(aborted());
    const request = this.pending = deferred<void>();
    this.desired = true;
    if (time !== undefined) {
      this.target = time;
      // Before metadata, HTMLMediaElement retains a default playback start position.
      this.audio.currentTime = time;
      this.applyTarget();
    }
    if (this.audio.readyState > 0 && Number.isFinite(this.audio.duration) && this.audio.currentTime >= this.audio.duration) {
      this.end(); return request.promise;
    }
    void this.audio.play().then(() => this.check(), error => {
      if (this.pending === request) { request.reject(normalize(error)); this.pending = undefined; }
    });
    return request.promise;
  }
  private applyTarget(): void {
    if (this.target === undefined || this.audio.readyState === 0) return;
    const duration = this.audio.duration;
    const target = Number.isFinite(duration) ? Math.min(duration, this.target) : this.target;
    this.target = undefined;
    this.audio.currentTime = target;
    if (Number.isFinite(duration) && target >= duration) this.end();
  }
  private check(): void {
    if (!this.desired) { this.audio.pause(); return; }
    if (this.target !== undefined || this.audio.seeking || this.audio.paused || this.audio.readyState < 3) return;
    this.started = true;
    this.update({ status: 'playing', error: null });
    this.progress();
    this.pending?.resolve(); this.pending = undefined;
  }
  private progress(): void {
    const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : null;
    this.update({ currentTime: this.audio.currentTime, duration });
  }
  private end(): void {
    if (!this.desired) return;
    this.desired = false;
    this.audio.pause();
    this.progress();
    this.update({ status: 'ended' });
    this.pending?.resolve(); this.pending = undefined;
  }
  pause(): void {
    this.desired = false;
    this.audio.pause();
    this.pending?.reject(aborted()); this.pending = undefined;
    this.progress();
    this.update({ status: 'paused' });
  }
  async dispose(): Promise<void> {
    if (this.dead) return;
    this.dead = true;
    this.desired = false;
    this.pending?.reject(aborted()); this.pending = undefined;
    for (const [name, fn] of this.listeners) this.audio.removeEventListener(name, fn);
    this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load();
  }
}
