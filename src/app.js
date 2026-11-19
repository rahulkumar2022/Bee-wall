import {Game,W,H,DT,HOLD} from './engine.js';
import levels from './levels.json';
import {drawBoard} from './art.js';
import {createSound} from './sound.js';
import {freshSave,decodeSave,createPlatform,createSaveQueue,createAnalytics} from './platform.js';

const byId=id=>document.getElementById(id);
const app=byId('app'), board=byId('board'), arena=byId('arena'), stage=byId('stage');
const result=byId('result'), fail=byId('fail'), scrim=byId('scrim'), sheet=byId('sheet'), sheetBody=byId('sheet-body');
const clock=byId('clock'), meter=byId('meter'), meterReadout=byId('meter-readout'), status=byId('status');
const ctx=board.getContext('2d',{alpha:false});
const sound=createSound(), platform=createPlatform(), analytics=createAnalytics();
const darkQuery=matchMedia('(prefers-color-scheme: dark)'), reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
const worlds=['Meadow','Barn','Garden','Orchard'];
const DEBUG=__DEBUG_TOOLS__ && new URLSearchParams(location.search).has('debug');
const failLines=['A bee slipped past the wall.','That bee found a gap.','The dog is okay. Try a new wall.'];
const fails=new Map();
const starPath='<svg class="star PLACEHOLDER" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3.2 6.5 7.2 1-5.2 5.1 1.3 7.3-6.5-3.5-6.5 3.5 1.3-7.3L1.6 9.5l7.2-1Z"/></svg>';
const lock='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
const starMarkup=n=>[0,1,2].map(i=>starPath.replace('PLACEHOLDER',i<n?'earned':'')).join('');

let save=freshSave(), game, levelIndex=0, lastPhase='draw', lastTick=null, clockRemainder=0, raf=0;
let initialized=false, paused=false, localHidden=false, platformAudio=platform.initialAudio(), saveError=false;
let pointer=null, inputLast=null, speed=0, resultAt=0, sessionActive=false, hintUsed=false, dialog=null, restoreFocus;
let pendingBest=0, submittedBest=0, scoreBusy=false, lastReplay=null, activeReplay=[];
let dark=false, reduced=reducedQuery.matches, resizePending=true, fps=60, hudCache='';
let bootStarted=false, bootSave=null;

function record(name,detail={}) { analytics.track(name,{level:levelIndex+1,...detail}); }
function endSession(reason){if(sessionActive){record('session_end',{reason});sessionActive=false;}}
function saveNow(){saves.push(JSON.stringify(save));}
async function reportBest(){
  if(paused || !platform.hosted || scoreBusy || submittedBest>=pendingBest) return;
  const score=pendingBest;
  scoreBusy=true;
  if(await platform.score(score)) submittedBest=score;
  scoreBusy=false;
  if(pendingBest>score) void reportBest();
}
const saves=createSaveQueue(async text=>{
  const ok=await platform.save(text);
  saveError=!ok;
  return ok;
},text=>{pendingBest=Math.max(pendingBest,decodeSave(text).best);void reportBest();});

function vibration(ms){if(!paused&&!localHidden&&save.settings.haptics) {try {navigator.vibrate?.(ms);} catch {/* optional */}}}
function audioSettings(){
  sound.set({allowed:platformAudio,paused:paused||localHidden||Boolean(dialog)||!initialized,sfx:save.settings.sfx,music:save.settings.music});
}
function theme(){
  dark=save.settings.theme==='dark'||(save.settings.theme==='system'&&darkQuery.matches);
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.querySelector('meta[name="theme-color"]').content=dark?'#1e1530':'#fff1c4';
}
function refreshHud(){
  const pct=Math.max(0,Math.min(100,Math.ceil(100*game.ink/game.budget)));
  const secs=Math.max(0,HOLD-game.time).toFixed(1);
  const key=`${levelIndex}/${pct}/${secs}/${game.phase}`;
  if(key===hudCache) return;
  hudCache=key;
  byId('level-number').textContent=String(levelIndex+1).padStart(2,'0');
  byId('world-name').textContent=worlds[game.level.world];
  clock.textContent=`${secs} s`;
  clock.dataset.active=String(game.phase==='run');
  meter.value=pct;
  meterReadout.textContent=`${pct}%`;
  stage.dataset.phase=game.phase;
}
function fit(){
  if(paused) {resizePending=true;return;}
  const available=arena.getBoundingClientRect();
  const scale=Math.max(.005,Math.min((available.width-4)/W,(available.height-5)/H));
  stage.style.width=`${W*scale}px`;stage.style.height=`${H*scale}px`;
  const dpr=Math.min(3,devicePixelRatio||1);
  const width=Math.max(1,Math.round(W*scale*dpr)), height=Math.max(1,Math.round(H*scale*dpr));
  if(board.width!==width || board.height!==height) {board.width=width;board.height=height;}
  resizePending=false;
}
function paint(){
  if(!game||paused) return;
  if(resizePending) fit();
  ctx.setTransform(board.width/W,0,0,board.height/H,0,0);
  drawBoard(ctx,game,{dark,reduced,at:game.age,hint:levelIndex===0&&!hintUsed&&!game.drawing&&game.phase==='draw',resultAt});
}
function detach(cancel=false){
  const id=pointer;pointer=null;inputLast=null;speed=0;
  if(cancel) {game?.cancel();activeReplay=[];}
  if(id!==null && board.hasPointerCapture(id)) board.releasePointerCapture(id);
}
function start(index){
  detach(true);
  levelIndex=index;game=new Game(levels[index],{assist:save.settings.assist});
  lastPhase='draw';resultAt=0;lastTick=null;clockRemainder=0;hudCache='';
  result.hidden=true;fail.hidden=true;
  stage.dataset.hint=String(index===0&&!hintUsed);
  status.textContent=`Level ${index+1}, ${game.level.name}.`;
  refreshHud();paint();
  record('level_start',{world:worlds[game.level.world]});
  sessionActive=true;
}
function retry(reason='button'){
  record('restart',{reason});
  if(reason==='button'||reason==='keyboard') sound.cue('tap');
  start(levelIndex);
}
function skip(){
  if(game.phase!=='fail'||(fails.get(levelIndex)??0)<5||levelIndex+1>=levels.length) return;
  record('level_skip',{attempts:fails.get(levelIndex)});
  save.unlocked=Math.max(save.unlocked,levelIndex+2);saveNow();start(levelIndex+1);
}
function changes(){
  if(game.phase===lastPhase) return;
  lastPhase=game.phase;resultAt=0;
  if(lastPhase==='run'){
    hintUsed=true;stage.dataset.hint='false';
    detach();
    sound.cue('release');vibration(14);
    lastReplay={level:levelIndex+1,points:activeReplay.map(p=>[...p])};
  } else if(lastPhase==='win'){
    sound.cue('win');vibration(28);fails.delete(levelIndex);
    const last=levelIndex+1===levels.length;
    save.stars[levelIndex]=Math.max(save.stars[levelIndex],game.stars);
    save.unlocked=Math.max(save.unlocked,Math.min(levels.length,levelIndex+2));
    save.best=Math.max(save.best,save.stars.reduce((sum,n)=>sum+n,0));
    saveNow();
    record('level_win',{stars:game.stars,ink_left:Math.round(game.ink),time:game.time});
    byId('stars').innerHTML=starMarkup(game.stars);
    byId('result-title').textContent=last?'All 40 levels cleared!':'Dog saved!';
    byId('result-copy').textContent=last?'More levels coming soon.':`${game.stars} ${game.stars===1?'star':'stars'} earned`;
    byId('primary').textContent=last?'Level select':'Next level';
    byId('secondary').textContent='Replay';byId('secondary').hidden=false;
    status.textContent=`${byId('result-title').textContent} ${game.stars} ${game.stars===1?'star':'stars'}.`;
    result.hidden=false;
  } else if(lastPhase==='fail'){
    sound.cue('fail');vibration(22);
    const count=(fails.get(levelIndex)??0)+1;fails.set(levelIndex,count);
    record('level_fail',{cause:'bee',time:+game.time.toFixed(3)});
    byId('fail-copy').textContent=failLines[(count-1)%failLines.length];
    byId('skip').hidden=count<5||levelIndex+1>=levels.length;
    status.textContent='A bee reached the dog. Try again.';
  }
  refreshHud();
}
function animate(now){
  raf=0;
  if(paused||localHidden||!initialized||dialog) return;
  const elapsed=lastTick===null?0:Math.max(0,(now-lastTick)/1000);
  lastTick=now;
  const elapsedSafe=Math.min(0.10,elapsed);
  if(elapsed>0) fps=fps*.95+(.05/elapsed);
  clockRemainder+=elapsedSafe;
  while (clockRemainder+1e-9>=DT) {
    clockRemainder-=DT;game.tick();changes();
  }
  if (game.phase==='win'||game.phase==='fail') resultAt+=elapsedSafe;
  if(game.phase==='fail'&&resultAt>=.4){
    if (fail.hidden) fail.hidden=false;
    if(save.settings.autoRetry&&byId('skip').hidden&&resultAt>=.82) retry('auto');
  }
  speed*=.86;
  const [dx,dy]=game.level.dog;
  let danger=0;
  if(game.phase==='run') for(const b of game.bees) danger=Math.max(danger,1-Math.hypot(dx-b.x,dy-b.y)/270);
  sound.update({phase:game.phase,drawing:game.drawing,speed,danger});
  refreshHud();paint();
  if(DEBUG) byId('debug').textContent=`${Math.round(fps)} fps · ${game.bees.length} bees · ${Math.round(game.ink)} ink`;
  schedule();
}
function schedule(){if(!raf&&!paused&&!localHidden&&!dialog&&initialized) raf=requestAnimationFrame(animate);}
function halt(){if(raf) cancelAnimationFrame(raf);raf=0;lastTick=null;clockRemainder=0;}
const usable=()=>initialized&&!paused&&!Boolean(dialog)&&!localHidden;
function coordinates(e){
  const r=board.getBoundingClientRect();
  return [(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height];
}
function moveTo(e){
  if(!game.drawing) return;
  const p=coordinates(e);
  if(inputLast) {
    const ms=Math.max(6,e.timeStamp-inputLast.ts);
    speed=Math.min(1200,Math.hypot(p[0]-inputLast.p[0],p[1]-inputLast.p[1])*1000/ms);
  }
  inputLast={p,ts:e.timeStamp};
  if(DEBUG&&activeReplay.length<4000) activeReplay.push(p);
  game.move(...p);changes();refreshHud();
}
board.addEventListener('pointerdown',e=>{
  if(!usable()||e.isPrimary===false||e.button!==0||pointer!==null) return;
  sound.unlock();
  if(game.phase==='fail'&&resultAt>=.4){retry('tap');return;}
  if(game.phase!=='draw') return;
  const p=coordinates(e);
  game.begin(...p);
  if(!game.drawing) return;
  pointer=e.pointerId;board.setPointerCapture(pointer);
  inputLast={p,ts:e.timeStamp};activeReplay=DEBUG?[p]:[];
  paint();
});
board.addEventListener('pointermove',e=>{
  if(!usable()||pointer!==e.pointerId) return;
  for(const point of e.getCoalescedEvents?.()??[]) {if(pointer===null)break;moveTo(point);}
  if(pointer!==null) moveTo(e);
  paint();
});
board.addEventListener('pointerup',e=>{
  if(!usable()||pointer!==e.pointerId) return;
  moveTo(e);game.end();detach();changes();refreshHud();paint();
});
for(const type of ['pointercancel','lostpointercapture']) board.addEventListener(type,e=>{
  if(pointer===e.pointerId) {detach(true);refreshHud();paint();}
});
board.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('pointerdown',e=>{
  if(!usable()||e.isPrimary===false||e.button!==0||game.phase!=='fail'||resultAt<.4||e.target.closest('button,canvas')) return;
  retry('tap');
});

function showSheet(name,returnTo){
  if(!initialized||paused||localHidden)return;
  if(!dialog){restoreFocus=returnTo||document.activeElement;detach(true);halt();paint();}
  dialog=name;
  scrim.hidden=false; app.setAttribute('inert','');sheetBody.textContent='';
  const title=byId('sheet-title');
  if(name==='settings'){
    title.textContent='Settings';
    sheetBody.append(byId('settings-template').content.cloneNode(true));
    const warning=sheetBody.querySelector('.save-note');
    warning.hidden=platform.loadState!=='failed'&&!saveError;
    warning.textContent='Saving is unavailable in this session.';
    for(const control of sheetBody.querySelectorAll('[data-setting]')){
      const key=control.dataset.setting;
      if(control.type==='checkbox') control.checked=save.settings[key];else control.value=save.settings[key];
      control.addEventListener('change',()=>{
        if(paused||localHidden)return;
        const value=control.type==='checkbox'?control.checked:control.value;
        save.settings[key]=value;record('settings_change',{setting:key,value});
        theme();audioSettings();saveNow();paint();
      });
    }
    byId('reset-progress').onclick=()=>showSheet('reset');
  } else if(name==='reset'){
    title.textContent='Reset progress?';
    sheetBody.innerHTML='<p>This locks levels and clears their stars. Your personal best stays.</p><div class="sheet-actions"><button class="plain-btn" id="cancel-reset" type="button">Cancel</button><button class="honey-btn" id="confirm-reset" type="button">Reset</button></div>';
    byId('cancel-reset').onclick=()=>showSheet('settings');
    byId('confirm-reset').onclick=()=>{
      if(paused||localHidden)return;
      const old=save;save=freshSave(old.best);save.settings={...old.settings};
      hintUsed=false;fails.clear();record('settings_change',{setting:'reset_progress',value:true});
      saveNow();closeSheet(byId('restart'));start(0);
    };
  } else {
    title.textContent='Level select';
    const summary=document.createElement('p');
    const total=save.stars.reduce((a,b)=>a+b,0);
    summary.textContent=`${total} / 120 stars · Personal best ${save.best}`;
    sheetBody.append(summary);
    for(const [worldIndex,name] of worlds.entries()){
      const group=document.createElement('section');group.className='world-group';
      const heading=document.createElement('h3');heading.textContent=name;
      const tiles=document.createElement('div');tiles.className='tiles';group.append(heading,tiles);
      for(const level of levels.filter(l=>l.world===worldIndex)){
        const index=level.id-1, locked=index>=save.unlocked;
        const btn=document.createElement('button');btn.type='button';btn.className='tile';btn.dataset.level=String(level.id);
        btn.disabled=locked;btn.setAttribute('aria-current',String(levelIndex===index));
        btn.setAttribute('aria-label',`Level ${level.id}: ${locked?'locked':`${save.stars[index]} stars`}. ${level.name}`);
        btn.innerHTML=`<span>${level.id}</span>${locked?lock:`<span class="stars">${starMarkup(save.stars[index])}</span>`}`;
        btn.onclick=()=>{if(paused||localHidden)return;closeSheet(byId('levels'));start(index);};
        tiles.append(btn);
      }
      sheetBody.append(group);
    }
  }
  sheetBody.scrollTop=0;
  byId(name==='reset'?'cancel-reset':'close').focus({preventScroll:true});audioSettings();
}
function closeSheet(focus=restoreFocus){
  if(!dialog||paused||localHidden)return;
  dialog=null;scrim.hidden=true;app.removeAttribute('inert');
  focus?.focus({preventScroll:true});audioSettings();schedule();
}
byId('close').onclick=()=>closeSheet();
scrim.addEventListener('pointerdown',e=>{if(e.target===scrim)closeSheet();});
document.addEventListener('keydown',e=>{
  if(paused||localHidden||!initialized)return;
  if(dialog){
    if(e.key==='Escape') {closeSheet();return;}
    if(e.key==='Tab'){
      const nodes=Array.from(sheet.querySelectorAll('button:not(:disabled),input,select')).filter(x=>x.getClientRects().length);
      const first=nodes[0],last=nodes[nodes.length-1];
      if(e.shiftKey&&(document.activeElement===first||!sheet.contains(document.activeElement))){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&(document.activeElement===last||!sheet.contains(document.activeElement))){e.preventDefault();first?.focus();}
    }
    return;
  }
  if(e.key.toLowerCase()==='r'&&!e.repeat&&!e.metaKey&&!e.ctrlKey&&!e.altKey){sound.unlock();retry('keyboard');}
});
for(const [id,action] of Object.entries({restart:()=>retry(),levels:()=>showSheet('levels'),settings:()=>showSheet('settings'),retry:()=>retry('try_again'),skip,
  primary:()=>{if(game.phase==='win'){if(levelIndex+1===levels.length)showSheet('levels',byId('primary'));else start(levelIndex+1);}},
  secondary:()=>retry('replay')})) byId(id).onclick=()=>{if(usable()){sound.unlock();action();}};

function resized(){resizePending=true;if(initialized&&!paused&&!localHidden)paint();}
if(typeof ResizeObserver!=='undefined') new ResizeObserver(resized).observe(arena);
window.addEventListener('resize',resized);
function mediaListen(query,fn){if(query.addEventListener) query.addEventListener('change',fn);else query.addListener(fn);}
mediaListen(darkQuery,()=>{if(!paused&&!localHidden){theme();paint();}});
mediaListen(reducedQuery,e=>{reduced=e.matches;if(!paused&&!localHidden)paint();});
platform.subscribe({
  pause(){
    if(paused)return;
    if(initialized) saveNow();
    paused=true;halt();detach(true);saves.pause();endSession('platform_pause');audioSettings();
    app.setAttribute('inert','');if(dialog)sheet.setAttribute('inert','');
  },
  resume(){
    if(!paused)return;
    paused=false;saves.resume();void reportBest();
    if(initialized){if(!dialog)app.removeAttribute('inert');sheet.removeAttribute('inert');sessionActive=true;theme();paint();}
    else requestBoot();
    audioSettings();schedule();
  },
  audio(enabled){platformAudio=enabled;audioSettings();}
});
if (__STANDALONE__) {
  document.addEventListener('visibilitychange',()=>{
    localHidden=document.hidden;
    if(localHidden){halt();detach(true);}else {paint();schedule();}
    audioSettings();
  });
  window.addEventListener('pagehide',()=>endSession('pagehide'));
}
if(__DEBUG_TOOLS__ && DEBUG) {
  byId('debug').hidden=false;
  window.BeeWallDebug=Object.freeze({
    snapshot:()=>({level:levelIndex+1,phase:game?.phase,time:game?.time,points:game?.points.length,ink:game?.ink,paused,fps}),
    replay:()=>lastReplay&&JSON.parse(JSON.stringify(lastReplay)),
    events:()=>analytics.read()
  });
}
// Put a painted loading frame before the first SDK signal. Do not expose the
// board or signal readiness while a host pause is in force.
function activate(){
  if(paused||!bootSave||initialized) return;
  save=bootSave;
  saveError=platform.loadState==='failed';
  hintUsed=save.unlocked>1 || save.stars[0]>0;
  theme();initialized=true;start(save.unlocked-1);
  app.removeAttribute('inert');byId('loading').hidden=true;
  audioSettings();platform.ready();
  if(save.best>0) {pendingBest=save.best;void reportBest();}
  schedule();
}
function requestBoot(){
  if(bootStarted){activate();return;}
  requestAnimationFrame(()=>requestAnimationFrame(async()=>{
    if(paused||bootStarted) return;
    bootStarted=true;platform.firstFrame();
    bootSave=decodeSave(await platform.load());activate();
  }));
}
requestBoot();
