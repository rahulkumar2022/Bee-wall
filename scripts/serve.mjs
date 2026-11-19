import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PLAYABLE_CSP = "default-src 'none'; script-src 'report-sample' 'self' 'unsafe-eval' 'unsafe-inline' blob: https://www.youtube.com/game_api/v0 https://www.youtube.com/game_api/v0/ https://www.youtube.com/game_api/v1 https://www.youtube.com/game_api/v1/; object-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com; connect-src 'self' blob: data:; sandbox allow-pointer-lock allow-same-origin allow-scripts; base-uri 'self'; manifest-src 'self'; worker-src 'self' blob:";
const MIMES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2','.svg':'image/svg+xml'};
export async function serve({port=0, host='127.0.0.1', root='dist', csp=false}={}) {
  const folder=resolve(root);
  const server=createServer(async(req,res)=>{
    try {
      if(!['GET','HEAD'].includes(req.method)) {res.writeHead(405).end();return;}
      const path=decodeURIComponent(new URL(req.url,'http://local').pathname);
      const target=resolve(folder,'.'+(path.endsWith('/')?path+'index.html':path));
      if(!target.startsWith(folder+sep) || !(await stat(target)).isFile()) throw new Error('Not a file');
      const headers={'Content-Type':MIMES[extname(target)]??'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
      if(csp && extname(target)==='.html') headers['Content-Security-Policy']=PLAYABLE_CSP;
      const content=req.method==='HEAD'?undefined:await readFile(target);
      res.writeHead(200,headers).end(content);
    } catch {res.writeHead(404).end('Not found');}
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,host,ok);});
  const url=`http://${host}:${server.address().port}`;
  return {server,url,close:()=>new Promise((ok,fail)=>server.close(error=>error?fail(error):ok()))};
}
if (import.meta.url===pathToFileURL(process.argv[1]??'').href) {
  const {url}=await serve({port:Number(process.env.PORT??8080),csp:process.argv.includes('--csp')});
  console.log(`${url}/standalone/ (offline)\n${url}/playables/ (SDK)`);
}
