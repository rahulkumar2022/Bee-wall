export const LEVEL_COUNT = 40;
export const STORAGE_KEY = 'bee-wall.save.v1';
export const defaultSettings = Object.freeze({sfx:true,music:true,haptics:true,assist:false,theme:'system',autoRetry:false});

export function freshSave(best=0) {
  return {v:1,unlocked:1,stars:Array(LEVEL_COUNT).fill(0),best,settings:{...defaultSettings}};
}

export function decodeSave(raw) {
  const out=freshSave();
  let data;
  try { data=JSON.parse(raw); } catch { return out; }
  if (!data || data.v!==1) return out;
  const int=(value,min,max,fallback)=>Number.isInteger(value)&&value>=min&&value<=max?value:fallback;
  out.unlocked=int(data.unlocked,1,LEVEL_COUNT,1);
  if (Array.isArray(data.stars)) {
    for (let i=0;i<out.unlocked;i++) out.stars[i]=int(data.stars[i],0,3,0);
  }
  out.best=Math.max(int(data.best,0,3*LEVEL_COUNT,0),out.stars.reduce((a,b)=>a+b,0));
  for (const key of Object.keys(defaultSettings)) {
    const value=data.settings?.[key];
    if (typeof value==='boolean' && key!=='theme') out.settings[key]=value;
    if (key==='theme' && ['system','light','dark'].includes(value)) out.settings[key]=value;
  }
  return out;
}

export function createPlatform({sdk=globalThis.ytgame,storage=()=>globalThis.localStorage}={}) {
  const hosted=sdk?.IN_PLAYABLES_ENV===true;
  let first=false, ready=false, loadState=hosted?'pending':'local';
  const safely=(fn)=>{try { return fn(); } catch { return undefined; }};
  return {
    hosted,
    get loadState(){return loadState;},
    firstFrame(){if (!first) { first=true; if(hosted) safely(()=>sdk.game.firstFrameReady()); }},
    ready(){if(first&&!ready) {ready=true;if(hosted) safely(()=>sdk.game.gameReady());}},
    initialAudio(){return !hosted || safely(()=>sdk.system.isAudioEnabled())===true;},
    subscribe({pause,resume,audio}){
      if (!hosted) return;
      sdk.system.onPause(pause);
      sdk.system.onResume(resume);
      sdk.system.onAudioEnabledChange(audio);
    },
    async load(timeout=2800){
      if(!hosted) return safely(()=>storage().getItem(STORAGE_KEY))??null;
      let timer;
      try {
        const timeoutResult=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('cloud load timed out')),timeout);});
        const value=await Promise.race([sdk.game.loadData(),timeoutResult]);
        loadState='loaded';
        return typeof value==='string'?value:null;
      } catch { loadState='failed';return null; }
      finally {clearTimeout(timer);}
    },
    async save(text){
      try {
        if(hosted) {
          if(loadState!=='loaded') return false;
          await sdk.game.saveData(text);
        } else storage().setItem(STORAGE_KEY,text);
        return true;
      } catch {return false;}
    },
    async score(value){
      if(!hosted || !Number.isInteger(value) || value<=0 || value>3*LEVEL_COUNT) return false;
      try {await sdk.engagement.sendScore({value});return true;} catch {return false;}
    }
  };
}

// One write in flight; subsequent milestones replace stale pending snapshots.
export function createSaveQueue(write, onCommit=()=>{}) {
  let pending=null, active=null, stopped=false;
  function drain(){
    if(stopped || active || pending===null) return;
    const value=pending; pending=null;
    // Mark active before invoking the writer, including synchronous implementations.
    active=Promise.resolve();
    let result;
    try { result=write(value); } catch { result=false; }
    active=Promise.resolve(result).catch(()=>false).then(ok=>{
      if(ok) onCommit(value);
    }).finally(()=>{active=null;drain();});
  }
  return {
    push(value){pending=value;drain();},
    pause(){stopped=true;}, resume(){stopped=false;drain();},
    async idle(){while(active) await active;}
  };
}

export function createAnalytics(limit=160) {
  const events=[];
  return {
    track(name,detail={}){
      events.push({name,...detail});
      if(events.length>limit) events.shift();
    },
    read(){return events.map(event=>({...event}));}
  };
}
