import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium, firefox, webkit, devices } from 'playwright';
import { serve } from './serve.mjs';
import { Game, W, H } from '../src/engine.js';
import { freshSave } from '../src/platform.js';

const levels=JSON.parse(await readFile(new URL('../src/levels.json',import.meta.url),'utf8'));
const solutions=JSON.parse(await readFile(new URL('../qa/solutions.json',import.meta.url),'utf8'));
const evidence=resolve('qa/evidence');await mkdir(evidence,{recursive:true});
const sdkURL='https://www.youtube.com/game_api/v1';
const site=await serve({csp:true});
const outcomes=[];
const standalone=`${site.url}/standalone/?debug=1`;
const hosted=`${site.url}/playables/`;
const visible=async locator=>{await locator.waitFor({state:'visible'});};
const click=(page,id)=>page.locator(`#${id}`).click();
const checkPhase=async(page,value)=>{
  await page.waitForFunction(v=>document.getElementById('stage').dataset.phase===v,value,{timeout:4500});
  assert.equal(await page.locator('#stage').getAttribute('data-phase'),value);
};
const checkLevel=async(page,n)=>assert.equal(Number(await page.locator('#level-number').textContent()),n);
const snapshot=page=>page.evaluate(()=>window.BeeWallDebug.snapshot());
const screenshot=(page,name)=>page.screenshot({path:resolve(evidence,`${name}.png`),animations:'disabled'});
const winPath=n=>solutions[n-1][0];

async function run(browserName,label,options,fn){
  const engine={chromium,webkit,firefox}[browserName];
  let browser;
  const errors=[],requests=[],start=performance.now();
  try {
    browser=await engine.launch();
    const context=await browser.newContext({...options});
    const page=await context.newPage();
    page.setDefaultTimeout(5000);
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('request',request=>requests.push(request.url()));
    page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
    const data=await fn(page,context);
    assert.deepEqual(errors,[],'browser errors');
    const unexpected=requests.filter(url=>!url.startsWith(site.url)&&!url.startsWith('file:')&&url!==sdkURL);
    assert.deepEqual(unexpected,[],'no external traffic except SDK');
    const record={scenario:label,browser:browserName,version:browser.version(),status:'PASS',ms:Math.round(performance.now()-start),data};
    outcomes.push(record);console.log(`PASS ${browserName}: ${label}`,data??'');
  } catch(error){
    outcomes.push({scenario:label,browser:browserName,status:'FAIL',error:error.stack,errors});
    console.error(`FAIL ${browserName}: ${label}\n${error.stack}\n${errors.join('\n')}`);
  } finally {await browser?.close();}
}
async function ready(page,url=standalone){
  const start=performance.now();await page.goto(url);await page.locator('#loading').waitFor({state:'hidden'});
  return Math.round(performance.now()-start);
}
async function positions(page,path){
  const rect=await page.locator('#board').boundingBox();
  assert.ok(rect);
  return path.map(([x,y])=>({x:rect.x+Math.max(.15,Math.min(W-.15,x))*rect.width/W,y:rect.y+Math.max(.15,Math.min(H-.15,y))*rect.height/H}));
}
async function mouseStroke(page,path,{lift=true}={}){
  const [start,...points]=await positions(page,path);
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  for(const {x,y} of points) await page.mouse.move(x,y);
  if(lift) await page.mouse.up();
}
function findFailPath(){
  for(const y of [25,60,100,150,210,280,360,430,510,590]) for(const x of [16,85,150,230,300]){
    const g=new Game(levels[0]);g.begin(x,y);g.move(x+22,y);g.end();
    for(let k=0;k<310&&g.phase==='run';k++) g.tick();
    if(g.phase==='fail')return [[x,y],[x+22,y]];
  }
  throw Error('No failure found for level 1');
}
async function bounds(page,{mobile=false}={}){
  const geometry=await page.evaluate(()=>{
    const r=document.querySelector('#board').getBoundingClientRect();
    return {w:innerWidth,h:innerHeight,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,
      overflow:[document.documentElement.scrollWidth-innerWidth,document.documentElement.scrollHeight-innerHeight],
      hud:document.querySelector('.hud').getBoundingClientRect().bottom,
      buttons:[...document.querySelectorAll('#app nav button')].map(x=>{const r=x.getBoundingClientRect();return [r.width,r.height,r.right];}),font:document.fonts.check('800 20px Baloo')};
  });
  assert.deepEqual(geometry.overflow,[0,0]);
  assert.ok(geometry.left>=0&&geometry.right<=geometry.w&&geometry.top>=0&&geometry.bottom<=geometry.h);
  assert.ok(Math.abs(geometry.width/geometry.height-W/H)<.006);
  assert.ok(geometry.buttons.every(([w,h,right])=>w>=44&&h>=44&&right<=geometry.w));
  if(mobile) assert.ok(geometry.h-geometry.hud>=79);
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>[...document.fonts].some(f=>f.family==='Baloo'&&f.status==='loaded')),'bundled font');
  return {viewport:[geometry.w,geometry.h],board:[Math.round(geometry.width),Math.round(geometry.height)]};
}

function mockSdk(payload=''){
  return `(()=>{const state={calls:[],payload:${JSON.stringify(payload)},audio:true};window.qaSDK=state;
    window.ytgame={IN_PLAYABLES_ENV:true,game:{
      firstFrameReady(){state.calls.push(['first',!document.querySelector('#loading').hidden]);},
      gameReady(){state.calls.push(['ready',document.querySelector('#loading').hidden,!document.querySelector('#app').hasAttribute('inert')]);},
      loadData(){state.calls.push(['load']);return Promise.resolve(state.payload);},
      saveData(text){state.calls.push(['save',text]);state.payload=text;return Promise.resolve();}
    },engagement:{sendScore(score){state.calls.push(['score',score]);return Promise.resolve();}},system:{
      isAudioEnabled(){return state.audio;},onAudioEnabledChange(fn){state.setAudio=x=>{state.audio=x;fn(x);};},
      onPause(fn){state.pause=fn;},onResume(fn){state.resume=fn;}
    }};
  })();`;
}
async function stubHost(context,payload){
  await context.route(sdkURL,route=>route.fulfill({contentType:'text/javascript',body:mockSdk(payload)}));
}
const cases=[
  ['chromium','desktop mouse, retry, win, save, settings, accessibility',{viewport:{width:1440,height:900}},async(page)=>{
    await page.clock.install();
    const readyMs=await ready(page);
    await checkLevel(page,1);await checkPhase(page,'draw');await bounds(page);
    assert.equal(await page.locator('#stage').getAttribute('data-hint'),'true');
    await mouseStroke(page,[winPath(1)[0]]);
    await checkPhase(page,'draw');assert.equal((await snapshot(page)).points,0);
    assert.equal(await page.locator('#stage').getAttribute('data-hint'),'true');
    const dog=levels[0].dog;await mouseStroke(page,[dog,[dog[0],dog[1]-45]]);assert.equal((await snapshot(page)).points,0);
    await mouseStroke(page,findFailPath()); await checkPhase(page,'run');
    await page.clock.runFor(5500);await checkPhase(page,'fail');await visible(page.locator('#retry'));
    await screenshot(page,'desktop-retry');
    await page.mouse.click(22,210);await checkPhase(page,'draw');
    await mouseStroke(page,winPath(1));await checkPhase(page,'run');
    await page.clock.runFor(5200);await checkPhase(page,'win');await visible(page.locator('#primary'));
    assert.ok(await page.locator('.result .star.earned').count()>=1);
    await screenshot(page,'desktop-win');
    const recorded=await page.evaluate(()=>window.BeeWallDebug.replay());
    assert.equal(recorded.level,1);assert.ok(recorded.points.length>=2);
    const events=await page.evaluate(()=>window.BeeWallDebug.events());
    for(const name of ['level_start','level_fail','restart','level_win']) assert.ok(events.some(x=>x.name===name),name);
    await click(page,'primary');await checkLevel(page,2);
    await page.reload();await page.locator('#loading').waitFor({state:'hidden'});await checkLevel(page,2);
    await click(page,'levels');await visible(page.locator('#sheet'));
    assert.equal(await page.locator('.tile').count(),40);
    assert.equal(await page.locator('.tile:disabled').count(),38);
    assert.match(await page.locator('[data-level="1"]').getAttribute('aria-label'),/[123] stars/);
    await screenshot(page,'levels');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#scrim').isHidden(),true);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'levels');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'settings');
    assert.ok(await page.locator('#settings').evaluate(e=>e.matches(':focus-visible')));
    await page.keyboard.press('Enter');await visible(page.locator('#sheet'));
    await page.locator('[data-setting="theme"]').selectOption('dark');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await click(page,'reset-progress');assert.equal(await page.locator('#sheet-title').textContent(),'Reset progress?');
    await click(page,'cancel-reset');assert.equal(await page.locator('#sheet-title').textContent(),'Settings');
    await click(page,'close');await checkLevel(page,2);
    await click(page,'settings');await click(page,'reset-progress');await click(page,'confirm-reset');await checkLevel(page,1);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await click(page,'levels');assert.equal(await page.locator('.tile:disabled').count(),39);
    assert.match(await page.locator('[data-level="1"]').getAttribute('aria-label'),/0 stars/);
    return {readyMs,levelTiles:40};
  }],
  ['chromium','Android emulation: touch, multitouch, stylus, resize, restart',{...devices['Pixel 7'],viewport:{width:393,height:851}},async(page,context)=>{
    await page.clock.install();await ready(page);const portrait=await bounds(page,{mobile:true});
    await screenshot(page,'android-meadow');
    const points=await positions(page,winPath(1)), cdp=await context.newCDPSession(page);
    const touch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
    const finger=(point,id)=>({...point,id,radiusX:3,radiusY:3});
    await touch('touchStart',[finger(points[0],1)]);
    const [second]=await positions(page,[[180,300]]);
    await touch('touchStart',[finger(points[0],1),finger(second,2)]);
    assert.equal((await snapshot(page)).points,1,'secondary touch ignored');
    for(const point of points.slice(1)) await touch('touchMove',[finger(point,1),finger(second,2)]);
    await touch('touchEnd',[]); await checkPhase(page,'run');
    await page.clock.runFor(550);
    const before=await snapshot(page);
    await page.setViewportSize({width:851,height:393});
    await page.clock.runFor(100);await checkPhase(page,'run');const landscape=await bounds(page);
    const after=await snapshot(page);
    assert.equal(after.points,before.points);assert.equal(after.ink,before.ink);assert.ok(after.time>=before.time);
    await screenshot(page,'android-landscape');
    await page.clock.runFor(5000);await checkPhase(page,'win');
    await click(page,'restart');await checkPhase(page,'draw');
    const penPoints=await positions(page,winPath(1));
    const pen=(type,p,buttons)=>cdp.send('Input.dispatchMouseEvent',{type,...p,pointerType:'pen',button:type==='mouseMoved'?'none':'left',buttons});
    await pen('mousePressed',penPoints[0],1);
    for(const p of penPoints.slice(1))await pen('mouseMoved',p,1);
    await pen('mouseReleased',penPoints.at(-1),0);await checkPhase(page,'run');
    const start=performance.now();await click(page,'restart');await checkPhase(page,'draw');
    const restartMs=Math.round(performance.now()-start);assert.ok(restartMs<1000);
    for(let i=0;i<20;i++)await click(page,'restart');
    assert.equal((await snapshot(page)).points,0);
    return {portrait,landscape,restartMs};
  }],
  ['chromium','ink exhaustion, five-fail skip, and extreme viewport sizes',{viewport:{width:320,height:1138}},async(page)=>{
    await page.clock.install();await ready(page);const thin=await bounds(page);
    await mouseStroke(page,[[20,250],[340,250],[340,280]],{lift:false});
    await checkPhase(page,'run');assert.equal(await page.locator('#meter-readout').textContent(),'0%');
    await page.mouse.up();
    await click(page,'restart');
    const path=findFailPath();
    for(let i=0;i<5;i++){
      await mouseStroke(page,path);await checkPhase(page,'run');
      await page.clock.runFor(5500);await checkPhase(page,'fail');
      await visible(page.locator('#retry'));
      assert.equal(await page.locator('#skip').isHidden(),i<4);
      if(i<4)await click(page,'retry');
    }
    await click(page,'skip');await checkLevel(page,2);await checkPhase(page,'draw');
    assert.ok((await page.evaluate(()=>BeeWallDebug.events())).some(e=>e.name==='level_skip'&&e.attempts===5));
    await page.setViewportSize({width:960,height:270});await page.clock.runFor(100);
    const wide=await bounds(page);await checkLevel(page,2);
    return {thin,wide};
  }],
  ['webkit','iPhone emulation: layout, dark mode, reduced motion, touch UI, corrupt save',{...devices['iPhone 13'],colorScheme:'dark',reducedMotion:'reduce'},async(page,context)=>{
    await context.addInitScript(()=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('bee-wall.save.v1','{broken ');sessionStorage.setItem('seeded','1');}});
    const readyMs=await ready(page);await checkLevel(page,1);await checkPhase(page,'draw');
    const geometry=await bounds(page,{mobile:true});
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await screenshot(page,'iphone-dark-reduced');
    await page.locator('#settings').tap();await visible(page.locator('#sheet'));
    await page.locator('label.setting').filter({hasText:'Assist mode'}).tap();
    assert.equal(await page.locator('[data-setting="assist"]').isChecked(),true);
    await page.locator('#close').tap();await page.locator('#restart').tap();
    assert.equal((await snapshot(page)).ink,levels[0].ink*1.5);
    return {readyMs,geometry};
  }],
  ['firefox','offline file, small desktop viewport, one-stroke win',{viewport:{width:320,height:568}},async(page,context)=>{
    await page.clock.install();await context.setOffline(true);
    const readyMs=await ready(page,pathToFileURL(resolve('dist/standalone/index.html')).href+'?debug');
    const geometry=await bounds(page);await screenshot(page,'firefox-320');
    await mouseStroke(page,winPath(1));await checkPhase(page,'run');
    await page.clock.runFor(5200);await checkPhase(page,'win');
    await click(page,'primary');await checkLevel(page,2);
    return {readyMs,geometry};
  }],
  ['chromium','release build with mock SDK: cloud load and save, order, pause, resume, score, completion',{viewport:{width:1100,height:820}},async(page,context)=>{
    const save=freshSave();save.unlocked=40;save.stars[0]=2;
    await stubHost(context,JSON.stringify(save));await page.clock.install();
    const readyMs=await ready(page,hosted);await checkLevel(page,40);await checkPhase(page,'draw');
    assert.deepEqual(await page.evaluate(()=>qaSDK.calls.slice(0,3)),[['first',true],['load'],['ready',true,true]]);
    assert.equal(await page.evaluate(()=>window.BeeWallDebug),undefined);
    assert.equal(await page.evaluate(()=>localStorage.length),0);
    await screenshot(page,'orchard-level-40');
    await mouseStroke(page,winPath(40));await checkPhase(page,'run');await page.clock.runFor(850);
    await page.evaluate(()=>qaSDK.pause());
    const frozen=await page.locator('#clock').textContent();
    const canvas=await page.locator('#board').evaluate(node=>node.toDataURL());
    await page.clock.runFor(6500);
    assert.equal(await page.locator('#clock').textContent(),frozen);
    assert.equal(await page.locator('#board').evaluate(node=>node.toDataURL()),canvas);
    assert.equal(await page.locator('#app').getAttribute('inert'),'');
    await page.evaluate(()=>qaSDK.resume());await page.clock.runFor(4500);
    await checkPhase(page,'win');assert.equal(await page.locator('#result-title').textContent(),'All 40 levels cleared!');
    const state=await page.evaluate(()=>({payload:JSON.parse(qaSDK.payload),calls:qaSDK.calls}));
    assert.equal(state.payload.unlocked,40);assert.ok(state.payload.stars[39]>=1);
    assert.equal(state.payload.best,2+state.payload.stars[39]);
    assert.deepEqual(state.calls.findLast(call=>call[0]==='score'),['score',{value:state.payload.best}]);
    await screenshot(page,'completed-game');
    await click(page,'secondary');await checkLevel(page,40);await checkPhase(page,'draw');
    return {readyMs,level40Stars:state.payload.stars[39],score:state.payload.best};
  }],
  ['chromium','release build audio gate: platform mute, resume and granular toggles',{viewport:{width:1024,height:768}},async(page,context)=>{
    await stubHost(context);
    await context.addInitScript(()=>{
      const orig=AudioNode.prototype.connect, probes=new Map();
      AudioNode.prototype.connect=function(dest,...args){
        if(dest===this.context.destination){
          if(!probes.has(this.context)) {
            const analyser=this.context.createAnalyser();analyser.fftSize=2048;
            probes.set(this.context,analyser);orig.call(analyser,dest);
          }
          return orig.call(this,probes.get(this.context),...args);
        }
        return orig.call(this,dest,...args);
      };
      window.rms=()=>Math.max(0,...[...probes.values()].map(a=>{
        const block=new Float32Array(a.fftSize);a.getFloatTimeDomainData(block);
        return Math.sqrt(block.reduce((s,x)=>s+x*x,0)/block.length);
      }));
    });
    await ready(page,hosted);
    await page.evaluate(()=>qaSDK.setAudio(false));
    await mouseStroke(page,winPath(1));await checkPhase(page,'run');
    await page.waitForTimeout(240);assert.ok(await page.evaluate(()=>rms())<.000001);
    await page.evaluate(()=>qaSDK.setAudio(true));
    await page.waitForFunction(()=>rms()>.00002,undefined,{timeout:3300});
    const unmuted=await page.evaluate(()=>rms());
    await page.evaluate(()=>qaSDK.pause());
    await page.waitForFunction(()=>rms()<.000001,undefined,{timeout:2000});
    await page.evaluate(()=>qaSDK.resume());
    await page.waitForFunction(()=>rms()>.00002,undefined,{timeout:2000});
    await page.evaluate(()=>qaSDK.setAudio(false));
    await page.waitForFunction(()=>rms()<.000001,undefined,{timeout:2200});
    await click(page,'settings');
    await page.locator('[data-setting="sfx"]').uncheck();
    await page.locator('[data-setting="music"]').uncheck();
    await click(page,'close');await page.evaluate(()=>qaSDK.setAudio(true));
    await page.waitForTimeout(180);assert.ok(await page.evaluate(()=>rms())<.000001);
    await click(page,'settings');await page.locator('[data-setting="music"]').check();await click(page,'close');
    await page.waitForFunction(()=>rms()>.00002,undefined,{timeout:2000});
    return {unmutedRms:unmuted};
  }]
];
try {
  const filter=process.argv.slice(2).join(' ').toLowerCase();
  const selected=cases.filter(([,label])=>label.toLowerCase().includes(filter));
  assert.ok(selected.length,'No matching browser scenarios');
  // Run sequentially to avoid inter-browser CPU contention during timing probes.
  for(const [engine,label,options,fn] of selected) await run(engine,label,options,fn);
  if(!filter)await writeFile(resolve(evidence,'browser-results.json'),JSON.stringify(outcomes,null,2)+'\n');
  if(outcomes.some(x=>x.status!=='PASS'))process.exitCode=1;
  console.log(`${outcomes.filter(x=>x.status==='PASS').length}/${selected.length} browser scenarios passed.`);
} finally {await site.close();}
