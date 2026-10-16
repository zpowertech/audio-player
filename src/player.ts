import { aborted, deferred, normalize, PlayerError, type Deferred } from './errors.js';
import { NativeBackend } from './native.js';
import { prepareContext, SilkBackend, type PreparedContext } from './silk-player.js';
import type { AudioPlayer, Backend, PlayerSnapshot, Update } from './types.js';

/** Instances are independent; share one instance for mutually exclusive chat voices. */
export function createAudioPlayer(): AudioPlayer {
  let snapshot: PlayerSnapshot = Object.freeze({ url: null, status: 'idle', currentTime: 0, duration: null, error: null });
  const listeners = new Set<() => void>();
  let backend: Backend | undefined;
  let generation = 0;
  let pending: Deferred<void> | undefined;
  let prepared: PreparedContext | undefined;
  let closing: Promise<void> | undefined;
  const cleanup = new Set<Promise<void>>();
  function retire(promise: Promise<void>): void {
    cleanup.add(promise); void promise.finally(() => cleanup.delete(promise)).catch(() => {});
  }
  function clearPrepared(): void {
    if (prepared) { retire(prepared.context.close().catch(() => {})); prepared = undefined; }
  }
  function publish(patch: Partial<PlayerSnapshot>): void {
    const next = { ...snapshot, ...patch };
    if (Object.keys(next).every(key => next[key as keyof PlayerSnapshot] === snapshot[key as keyof PlayerSnapshot])) return;
    snapshot = Object.freeze(next);
    for (const listener of [...listeners]) {
      // A subscriber must not corrupt playback state or prevent other subscribers.
      try { listener(); } catch (error) { globalThis.reportError?.(error); }
    }
  }
  function cancelPending(): void { pending?.reject(aborted()); pending = undefined; }
  const player: AudioPlayer = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (snapshot.status === 'disposed') return () => {};
      listeners.add(listener); return () => { listeners.delete(listener); };
    },
    play(input) {
      let ownRequest: Deferred<void> | undefined;
      try {
        if (snapshot.status === 'disposed') throw new PlayerError('DISPOSED', 'Player has been disposed');
        if (typeof window === 'undefined' || typeof Audio === 'undefined') throw new PlayerError('NOT_SUPPORTED', 'Playback requires a browser');
        if (input !== undefined && (typeof input !== 'string' || !input.trim())) throw new PlayerError('INVALID_ARGUMENT', 'url must be a non-empty string');
        let url = snapshot.url;
        if (input !== undefined) {
          try { url = new URL(input, document.baseURI).href; }
          catch (cause) { throw new PlayerError('INVALID_ARGUMENT', 'Invalid audio URL', cause); }
          if (!/^(https?:|blob:|data:)/.test(url)) throw new PlayerError('INVALID_ARGUMENT', 'Only HTTP(S), blob and data URLs are supported');
        }
        if (!url) throw new PlayerError('NO_SOURCE', 'Provide a URL for the first play() call');
        const replace = !backend || url !== snapshot.url || snapshot.status === 'error';
        if (!replace) {
          if (pending) return pending.promise;
          if (snapshot.status === 'playing' || snapshot.status === 'buffering') return Promise.resolve();
        }
        const time = replace || snapshot.status === 'ended' ? 0 : undefined;
        cancelPending();
        const request = ownRequest = pending = deferred<void>();
        let patch: Partial<PlayerSnapshot>;
        if (replace) {
          const previous = backend;
          backend = undefined; ++generation; clearPrepared();
          if (previous) retire(previous.dispose());
          patch = { url, status: 'loading', currentTime: 0, duration: null, error: null };
          const ticket = generation;
          const update: Update = patch => { if (ticket === generation && snapshot.status !== 'disposed') publish(patch); };
          const silk = /\.(slk|silk)$/i.test(new URL(url).pathname);
          if (silk) backend = new SilkBackend(url, update);
          else {
            // Unlock a potential SILK fallback while still inside the click call stack.
            try { prepared = prepareContext(); } catch { /* Native playback can still work. */ }
            backend = new NativeBackend(url, update);
          }
        } else patch = { status: 'loading', error: null };
        if (backend instanceof NativeBackend && !prepared) {
          try { prepared = prepareContext(); } catch { /* Native playback remains available. */ }
        }
        const selected = backend!;
        const ticket = generation;
        const selectedURL = url;
        publish(patch);
        if (pending !== request || ticket !== generation) return request.promise;
        void (async () => {
          try {
            try { await selected.play(time); }
            catch (cause) {
              if (pending !== request || ticket !== generation) throw cause;
              if (!(selected instanceof NativeBackend) || normalize(cause).code !== 'NOT_SUPPORTED') throw cause;
              retire(selected.dispose());
              if (pending !== request || ticket !== generation) throw aborted();
              const fallback = new SilkBackend(selectedURL, patch => { if (ticket === generation && snapshot.status !== 'disposed') publish(patch); }, prepared);
              prepared = undefined;
              backend = fallback;
              await fallback.play(time);
            }
            if (pending === request) { pending = undefined; clearPrepared(); request.resolve(); }
          } catch (cause) {
            if (pending !== request || ticket !== generation) return;
            pending = undefined; clearPrepared();
            const error = normalize(cause);
            publish({ status: 'error', error }); request.reject(error);
          }
        })();
        return request.promise;
      } catch (cause) {
        // Includes synchronous browser constructor/currentTime failures.
        const error = normalize(cause, 'INVALID_ARGUMENT');
        if (ownRequest && pending === ownRequest) { pending = undefined; clearPrepared(); publish({ status: 'error', error }); ownRequest.reject(error); return ownRequest.promise; }
        return Promise.reject(error);
      }
    },
    pause() {
      if (!backend || snapshot.status === 'disposed' || snapshot.status === 'ended' || snapshot.status === 'error') return;
      cancelPending(); clearPrepared(); backend.pause();
    },
    dispose() {
      if (closing) return closing;
      ++generation; cancelPending(); clearPrepared();
      if (backend) { retire(backend.dispose()); backend = undefined; }
      publish({ status: 'disposed', url: null, currentTime: 0, duration: null, error: null });
      listeners.clear();
      closing = Promise.allSettled([...cleanup]).then(() => {});
      return closing;
    },
  };
  return player;
}
