import * as sdk from '@zpowertech/audio-player';
window.sdk=sdk;
window.player=sdk.createAudioPlayer();
window.run = () => {
  window.result=null;
  player.play(new URL('fixtures/test.slk',location.href).href)
    .then(()=>window.result={ok:true},e=>window.result={error:e.message});
};
document.querySelector('#run').onclick=()=>window.run();
document.querySelector('#ready').textContent='ready';
