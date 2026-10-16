import { createAudioPlayer, type AudioPlayer, type PlayerSnapshot, type AudioPlayerError } from '@zpowertech/audio-player';
const player: AudioPlayer = createAudioPlayer();
void player.play('/voice.silk');
void player.play();
void player.play(undefined);
player.pause();
// @ts-expect-error play accepts a URL, not an options object
void player.play({url:'/voice.silk'});
// @ts-expect-error play has no second options argument
void player.play('/voice.silk', {format:'silk'});
// @ts-expect-error PlayOptions is no longer part of the public API
import type { PlayOptions } from '@zpowertech/audio-player';
const snapshot: PlayerSnapshot = player.getSnapshot();
const error: AudioPlayerError | null = snapshot.error;
const unsubscribe: () => void = player.subscribe(() => console.log(snapshot.currentTime,error));
unsubscribe(); void player.dispose();
// @ts-expect-error no old decoder API
import { loadSilk } from '@zpowertech/audio-player';
// @ts-expect-error internal modules are not exported
import {} from '@zpowertech/audio-player/dist/silk/loader.js';
