import { build } from 'esbuild';
import { mkdir,readFile,writeFile,copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(p,enc)=>readFile(resolve(root,p),enc);
const [template,style,font]=await Promise.all([read('src/index.html','utf8'),read('src/style.css','utf8'),read('assets/baloo2.woff2')]);
for(const name of ['standalone','playables']){
  const standalone=name==='standalone';
  const {outputFiles}=await build({absWorkingDir:root,entryPoints:['src/app.js'],bundle:true,write:false,
    format:'iife',target:['safari14.1','chrome80','firefox78'],minify:true,legalComments:'none',
    define:{__STANDALONE__:String(standalone)}});
  const html=template
    .replace('<!-- SDK -->',standalone?'':'<script src="https://www.youtube.com/game_api/v1"></script>')
    .replace('<!-- STYLE -->',()=>`<style>${style.replace('__BALOO_FONT__',`data:font/woff2;base64,${font.toString('base64')}`)}</style>`)
    .replace('<!-- GAME -->',()=>`<script>${outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script>`);
  const dir=resolve(root,'dist',name);await mkdir(dir,{recursive:true});
  await writeFile(resolve(dir,'index.html'),html);
  await copyFile(resolve(root,'assets','OFL-Baloo2.txt'),resolve(dir,'OFL-Baloo2.txt'));
  console.log(`${name}: ${Buffer.byteLength(html)} bytes (HTML with game, font, art, and audio)`);
}
const release=resolve(root,'release');await mkdir(release,{recursive:true});
const zip=resolve(release,'Bee-Wall-Playables-v1.0.0.zip');
// Stream the archive to a new file to prevent stale entries from previous builds.
await writeFile(zip,execFileSync('zip',['-X','-q','-','index.html','OFL-Baloo2.txt'],{cwd:resolve(root,'dist/playables')}));
console.log(zip);
