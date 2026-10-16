import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const root=resolve('.test-package/webpack/build');
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith('/nested/'))throw Error();
  let file=resolve(root,decodeURIComponent(url.pathname.slice('/nested/'.length)));
  if(file!==root&&!file.startsWith(root+sep))throw Error();
  if((await stat(file)).isDirectory())file=resolve(file,'index.html');
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.wav':'audio/wav'})[extname(file)]??'application/octet-stream');
  res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}
}).listen(4284,'127.0.0.1');
