export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'seeking' | 'ended' | 'error' | 'disposed';
export type AudioPlayerErrorCode = 'INVALID_ARGUMENT' | 'NO_SOURCE' | 'NOT_SUPPORTED' | 'NETWORK' | 'AUTOPLAY_BLOCKED' | 'DECODE' | 'WASM_INIT' | 'DISPOSED';
export interface AudioPlayerError extends Error {
  readonly code: AudioPlayerErrorCode;
  readonly cause?: unknown;
}
export interface PlayerSnapshot {
  /** Absolute URL, resolved against document.baseURI. */
  readonly url: string | null;
  readonly status: PlayerStatus;
  readonly currentTime: number;
  /** null until known; never NaN or Infinity. */
  readonly duration: number | null;
  readonly error: AudioPlayerError | null;
}
export interface AudioPlayer {
  /** Auto-detects the format of a finite audio URL. Omit the URL to resume; resolves on playback start. */
  play(url?: string): Promise<void>;
  pause(): void;
  getSnapshot(): PlayerSnapshot;
  subscribe(listener: () => void): () => void;
  /** Terminal, idempotent; getSnapshot remains readable after disposal. */
  dispose(): Promise<void>;
}
export type Update = (patch: Partial<Omit<PlayerSnapshot, 'url'>>) => void;
export interface Backend {
  play(time?: number): Promise<void>;
  pause(): void;
  dispose(): Promise<void>;
}
