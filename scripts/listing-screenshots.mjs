import assert from 'node:assert/strict';
import { mkdir,readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { freshSave } from '../src/platform.js';
import { serve } from './serve.mjs';

const out=resolve('release','screenshots');await mkdir(out,{recursive:true});
const solutions=JSON.parse(await readFile('qa/solutions.json','utf8'));
const site=await serve();
const browser=await chromium.launch();
try {
  for(const [level,slug,shot] of [[1,'meadow','run'],[13,'barn','draw'],[24,'garden','run'],[40,'orchard','run']]){
    const context=await browser.newContext({viewport:{width:540,height:960},deviceScaleFactor:2, colorScheme:'light',hasTouch:false});
    const save=freshSave();save.unlocked=level;save.settings.music=false;save.settings.sfx=false;
    await context.addInitScript(data=>localStorage.setItem('bee-wall.save.v1',data),JSON.stringify(save));
    const page=await context.newPage();await page.clock.install();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${site.url}/standalone/`);
    await page.locator('#loading').waitFor({state:'hidden'});
    assert.equal(Number(await page.locator('#level-number').textContent()),level);
    await page.evaluate(()=>document.fonts.ready);
    if(shot==='run'){
      const r=await page.locator('#board').boundingBox();assert.ok(r);
      const index=level===1?1:0;
      const points=solutions[level-1][index].map(([x,y])=>[r.x+Math.max(.2,Math.min(359.8,x))*r.width/360,r.y+Math.max(.2,Math.min(639.8,y))*r.height/640]);
      await page.mouse.move(...points[0]);await page.mouse.down();
      for(const p of points.slice(1))await page.mouse.move(...p);
      await page.mouse.up();await page.clock.runFor(level===40?2250:2050);
      assert.equal(await page.locator('#stage').getAttribute('data-phase'),'run');
    }
    assert.equal(await page.evaluate(()=>window.BeeWallDebug),undefined);
    assert.deepEqual(errors,[]);
    const target=resolve(out,`${String(level).padStart(2,'0')}-${slug}.png`);
    await page.screenshot({path:target});console.log(target);
    await context.close();
  }
}finally{await browser.close();await site.close();}
