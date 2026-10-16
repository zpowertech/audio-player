import React from 'react';
import { createRoot } from 'react-dom/client';
import { usePlayVoice, voicePlayer } from './usePlayVoice';
function Voice({ label, url }: {label:string;url:string}) {
 const {playing,loading,error,togglePlay}=usePlayVoice(url);
 return <li style={{margin:'16px 0'}}><button onClick={togglePlay} style={{font:'inherit',padding:'12px 20px'}}>{label} · {playing?'播放中，点击暂停':loading?'加载中，点击暂停':'播放 / 续播'}</button>{error&&<p role="alert">{error}</p>}</li>;
}
function App(){return <main style={{font:'16px system-ui',maxWidth:720,margin:'64px auto',padding:24}}><h1>聊天语音示例</h1><p>同条点击可暂停、续播；不同条即使 URL 相同也会从头播放。</p><ul>
 <Voice label="语音 A" url="/test/fixtures/test.slk"/><Voice label="语音 B（相同 URL）" url="/test/fixtures/test.slk"/><Voice label="原生 WAV" url="/test/fixtures/voice.wav"/>
 </ul><a href="../">返回播放器</a></main>;}
createRoot(document.getElementById('root')!).render(<App/>);
window.addEventListener('pagehide',()=>{void voicePlayer.dispose();},{once:true});
