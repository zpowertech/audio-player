import {createAudioPlayer} from '../dist/index.js';
const player=createAudioPlayer();
const url=document.querySelector('#url'),error=document.querySelector('#error');
let ownedURL;
const describe=e=>{if(e.name!=='AbortError')error.textContent=`${e.code??e.name}: ${e.message}`;};
const play=()=>{error.textContent='';void player.play(url.value).catch(describe);};
document.querySelector('#play').onclick=()=>play();
document.querySelector('#pause').onclick=()=>player.pause();
document.querySelector('#file').onchange=e=>{
 const file=e.target.files?.[0];if(!file)return;
 player.pause();if(ownedURL)URL.revokeObjectURL(ownedURL);
 ownedURL=URL.createObjectURL(file);url.value=ownedURL;
};
player.subscribe(()=>{
 const s=player.getSnapshot();document.querySelector('#state').textContent=`${s.status} · ${s.currentTime.toFixed(2)} s / ${s.duration===null?'未知':s.duration.toFixed(2)+' s'}`;
 if(s.error)describe(s.error);
});
window.addEventListener('pagehide',()=>{void player.dispose();if(ownedURL)URL.revokeObjectURL(ownedURL);},{once:true});
