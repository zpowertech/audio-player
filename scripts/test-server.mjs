import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const fixture = await readFile(resolve(root, 'test/fixtures/test.slk'));
const packets = []; let cursor = 10;
while(cursor < fixture.length) { const n = fixture.readInt16LE(cursor); if(n < 0) break; packets.push(fixture.subarray(cursor,cursor+2+n)); cursor += n+2; }
const stats = new Map();
const types = { '.html':'text/html', '.js':'text/javascript', '.wasm':'application/wasm', '.wav':'audio/wav', '.mp3':'audio/mpeg', '.m4a':'audio/mp4', '.aac':'audio/aac', '.flac':'audio/flac', '.ogg':'audio/ogg', '.opus':'audio/ogg', '.webm':'audio/webm', '.slk':'application/octet-stream', '.silk':'application/octet-stream' };
const server = createServer(async(req,res) => {
  const url = new URL(req.url,'http://localhost');
  const id = url.searchParams.get('id') ?? 'default';
  res.setHeader('Cache-Control','no-store');
  if (url.searchParams.get('cors') !== '0') res.setHeader('Access-Control-Allow-Origin','*');
  if (url.pathname === '/report' && req.method === 'POST') {
    let body='';for await(const chunk of req){body+=chunk;if(body.length>100000){res.writeHead(413);res.end();return;}}
    try{const report=JSON.parse(body);await mkdir(resolve(root,'output'),{recursive:true});await writeFile(resolve(root,'output/manual-results.json'),JSON.stringify(report,null,2));res.end('saved');}catch{res.writeHead(400);res.end();}return;
  }
  if (url.pathname === '/stats') { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(stats.get(id) ?? {})); return; }
  if (url.pathname === '/stream.silk' || url.pathname === '/opaque' || url.pathname === '/broken.silk') {
    const record = { requests:(stats.get(id)?.requests ?? 0)+1, done:false, sent:0, aborted:false }; stats.set(id,record);
    res.setHeader('Content-Type','application/octet-stream');
    res.flushHeaders();
    const header = fixture.subarray(Number(url.searchParams.get('skip') ?? 0),10);
    res.write(header);
    let i=0; let timer;
    const batch = Number(url.searchParams.get('batch') ?? 5);
    const delay = Number(url.searchParams.get('delay') ?? 40);
    const send = () => {
      if(res.destroyed) return;
      if(url.pathname === '/broken.silk' && i >= 20) { res.end(Buffer.from([30,0,1])); record.done=true; return; }
      if(i>=packets.length) { record.done=true; res.end(url.searchParams.has('marker') ? Buffer.from([255,255]) : undefined); return; }
      for(let n=0;n<batch && i<packets.length;n++,i++) res.write(packets[i]);
      record.sent=i;
      timer=setTimeout(send, i===25 && url.searchParams.has('gap') ? 1000 : delay);
    };
    timer=setTimeout(send,Number(url.searchParams.get('initial') ?? 0));
    res.on('close',()=>{clearTimeout(timer);if(!record.done)record.aborted=true;});
    return;
  }
  try {
    const pathname=url.pathname === '/' ? '/test/browser/index.html' : decodeURIComponent(url.pathname);
    let path=resolve(root,'.'+pathname);
    if(!path.startsWith(root+sep)) throw Error('outside root');
    if((await stat(path)).isDirectory()) path=resolve(path,'index.html');
    const body=await readFile(path);
    res.setHeader('Content-Type',types[extname(path)] ?? 'application/octet-stream');
    res.setHeader('Accept-Ranges','bytes');
    const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if(match) {
      const start=Number(match[1]); const end=Math.min(body.length-1,match[2]?Number(match[2]):body.length-1);
      if(start> end) {res.writeHead(416,{'Content-Range':`bytes */${body.length}`});res.end();return;}
      res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${body.length}`,'Content-Length':end-start+1});res.end(body.subarray(start,end+1));
    } else {res.setHeader('Content-Length',body.length);res.end(body);}
  } catch {res.writeHead(404);res.end('Not found');}
});
server.listen(4280,'127.0.0.1');
