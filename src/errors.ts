import type { AudioPlayerError, AudioPlayerErrorCode } from './types.js';
export class PlayerError extends Error implements AudioPlayerError {
  constructor(readonly code: AudioPlayerErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'AudioPlayerError';
  }
}
export const aborted = (): DOMException => new DOMException('Playback request superseded or paused', 'AbortError');
export function normalize(error: unknown, fallback: AudioPlayerErrorCode = 'DECODE'): AudioPlayerError {
  if (error instanceof PlayerError) return error;
  const name = error instanceof Error ? error.name : '';
  const code = name === 'NotAllowedError' ? 'AUTOPLAY_BLOCKED' : name === 'NotSupportedError' ? 'NOT_SUPPORTED' : fallback;
  return new PlayerError(code, error instanceof Error ? error.message : String(error), error);
}
export interface Deferred<T> { promise: Promise<T>; resolve(value: T): void; reject(reason: unknown): void; }
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
