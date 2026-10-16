import { useId, useSyncExternalStore } from 'react';
import { createAudioPlayer, type PlayerStatus } from '../../dist/index.js';

// One active player shared by the application. The SDK never creates a global player.
export let voicePlayer = createAudioPlayer();
const initial = Object.freeze({ key: null as string | null, status: 'idle' as PlayerStatus, error: null as string | null });
let snapshot = initial;
let selectedKey: string | null = null;
let operation = 0;
const subscribers = new Set<() => void>();
function emit(error = voicePlayer.getSnapshot().error?.message ?? null) {
  const next = { key: selectedKey, status: voicePlayer.getSnapshot().status, error };
  if (next.key === snapshot.key && next.status === snapshot.status && next.error === snapshot.error) return;
  snapshot = Object.freeze(next);
  for (const fn of subscribers) fn();
}
let unsubscribePlayer = voicePlayer.subscribe(() => emit());
const subscribe = (fn: () => void) => { subscribers.add(fn); return () => { subscribers.delete(fn); }; };
const getSnapshot = () => snapshot;
const getServerSnapshot = () => initial;

/** Share playback across messages, including different messages with the same URL. */
export function usePlayVoice(url: string) {
  const key = useId();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const active = state.key === key;
  return {
    playing: active && state.status === 'playing',
    loading: active && ['loading', 'buffering', 'seeking'].includes(state.status),
    error: active ? state.error : null,
    togglePlay() {
      const same = selectedKey === key;
      const status = voicePlayer.getSnapshot().status;
      const ticket = ++operation;
      if (same && ['playing', 'loading', 'buffering', 'seeking'].includes(status)) {
        voicePlayer.pause(); return;
      }
      // Replace the instance so a different row starts at zero, even with the same URL.
      // Keep play() in the click call stack to preserve the browser's user activation.
      if (!same && selectedKey !== null) {
        unsubscribePlayer();
        void voicePlayer.dispose();
        voicePlayer = createAudioPlayer();
        unsubscribePlayer = voicePlayer.subscribe(() => emit());
      }
      selectedKey = key;
      const task = voicePlayer.play(url);
      emit();
      void task.catch(error => {
        if (ticket === operation && error?.name !== 'AbortError') emit(error.message);
      });
    },
  };
}
