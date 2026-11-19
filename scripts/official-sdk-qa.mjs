import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serve } from './serve.mjs';

// Real Google Test Suite. Only the localhost URL is entered; no portal upload.
const suiteURL='https://developers.google.com/youtube/gaming/playables/test_suite';
const evidence=resolve('qa/evidence');await mkdir(evidence,{recursive:true});
const solutions=JSON.parse(await readFile('qa/solutions.json','utf8'));
const site=await serve({csp:true});
const browser=await chromium.launch({args:['--disable-features=LocalNetworkAccessChecks']});
const context=await browser.newContext({viewport:{width:1520,height:1040}});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('requestfailed',r=>{if(r.url().includes(site.url)||r.url().includes('/game_api/v1'))errors.push(`${r.failure()?.errorText} ${r.url()}`);});
try {
  await page.goto(suiteURL,{waitUntil:'domcontentloaded',timeout:20000});
  const field=page.getByPlaceholder('https://localhost:8000');
  await field.waitFor({timeout:20000});
  await field.fill(`${site.url}/playables/index.html`);await field.press('Enter');
  const game=page.frameLocator('main-app iframe');
  const board=game.locator('#board');
  await board.waitFor({timeout:20000});
  await game.locator('#loading').waitFor({state:'hidden',timeout:9000});
  await board.scrollIntoViewIfNeeded();
  const w=await board.boundingBox();
  assert.ok(w?.width>=50);
  const positions=solutions[0][1].map(([x,y])=>[w.x+Math.max(1,Math.min(359,x))*w.width/360,w.y+Math.max(1,Math.min(639,y))*w.height/640]);
  await page.mouse.move(...positions[0]);await page.mouse.down();
  for(const [x,y] of positions.slice(1))await page.mouse.move(x,y,{steps:8});
  await page.mouse.up();
  await game.locator('#stage[data-phase="run"]').waitFor({timeout:3000});
  await game.locator('#result-title').filter({hasText:'Dog saved!'}).waitFor({timeout:15000});
  const suite=page.locator('main-app');
  await suite.getByText('5/5 passed',{exact:false}).waitFor({timeout:5000});
  const text=(await suite.ariaSnapshot()).split('\n').filter(x=>/pass|Score|firstFrame|gameReady|saveData|loadData|SDK Events|bundle/i.test(x));
  await writeFile(resolve(evidence,'official-sdk-results.txt'),text.join('\n')+'\n');
  await page.screenshot({path:resolve(evidence,'official-sdk-suite.png'),fullPage:true});
  console.log(text.join('\n'));
} catch(error){
  const state=(await page.locator('body').ariaSnapshot().catch(()=>'' )).split('\n').filter(x=>/MUST|SHOULD|Game URL|SDK Events|circle|error|invite code/i.test(x)).slice(0,25);
  const detail=[error.stack,...errors,...state].join('\n');
  await writeFile(resolve(evidence,'official-sdk-attempt.txt'),detail+'\n');
  console.error(detail);
  process.exitCode=1;
} finally {await browser.close();await site.close();}
