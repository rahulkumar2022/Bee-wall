import { build } from 'esbuild';
import { mkdir,readFile,writeFile,copyFile,utimes } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(p,enc)=>readFile(resolve(root,p),enc);
const [template,style,font]=await Promise.all([read('src/index.html','utf8'),read('src/style.css','utf8'),read('assets/baloo2.woff2')]);
const builds=['standalone','playables'];
if(process.argv.includes('--pages')) builds.push('pages');
for(const name of builds){
  const standalone=name!=='playables';
  const {outputFiles}=await build({absWorkingDir:root,entryPoints:['src/app.js'],bundle:true,write:false,
    format:'iife',target:['safari14.1','chrome80','firefox78'],minify:true,legalComments:'none',
    define:{__STANDALONE__:String(standalone),__DEBUG_TOOLS__:String(name==='standalone')}});
  const html=template
    .replace('<!-- SDK -->',standalone?'':'<script src="https://www.youtube.com/game_api/v1"></script>')
    .replace('<!-- STYLE -->',()=>`<style>${style.replace('__BALOO_FONT__',`data:font/woff2;base64,${font.toString('base64')}`)}</style>`)
    .replace('<!-- GAME -->',()=>`<script>${outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script>`);
  const dir=resolve(root,'dist',name);await mkdir(dir,{recursive:true});
  await writeFile(resolve(dir,'index.html'),html);
  await copyFile(resolve(root,'assets','OFL-Baloo2.txt'),resolve(dir,'OFL-Baloo2.txt'));
  if(name==='pages') await writeFile(resolve(dir,'.nojekyll'),'');
  console.log(`${name}: ${Buffer.byteLength(html)} bytes (HTML with game, font, art, and audio)`);
}
const release=resolve(root,'release');await mkdir(release,{recursive:true});
const zip=resolve(release,'Bee-Wall-Playables-v1.0.0.zip');
const zipSource=resolve(root,'dist/playables'), entries=['index.html','OFL-Baloo2.txt'];
// Use a fixed timestamp and UTC so the same inputs produce the same ZIP.
const archiveTime=new Date('2000-01-01T00:00:00Z');
await Promise.all(entries.map(file=>utimes(resolve(zipSource,file),archiveTime,archiveTime)));
await writeFile(zip,execFileSync('zip',['-X','-q','-',...entries],{cwd:zipSource,env:{...process.env,TZ:'UTC'}}));
console.log(zip);
