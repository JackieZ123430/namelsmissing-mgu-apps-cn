'use strict';
const mgu=require('./kit/mgu'),fs=require('fs'),path=require('path');
const Guard=require('./guard');
const {Reader,Capture}=require('./probe');
mgu.run({async start(ctx){
 const {ui,settings,log}=ctx, capture=new Capture(),reader=new Reader(ctx.signals,log);
 let lastCombined=null, lastRead=0, pending=false, generation=0, exported='', closing=false;
 const enabled=()=>settings.get('enabled')===true;
 const guard=new Guard(Date.now,()=>{});
 const stop=(why)=>{generation++;capture.stop(why);};
 const update=()=>{
   const g=guard.snapshot(),c=capture.snapshot();
   ui.text('STATUS',(enabled()?'Diagnostic mode ON':'Diagnostic mode OFF')+' | physical flashing unavailable');
   if(!ui.isVisible('DIAGNOSTICS'))return;
   ui.text('DIAG_STATE',c.reason+' | BDC '+(reader.index||'not identified')+
       '\n'+(g.blockedBy||'P / stationary')+' | Combined light: '+(lastCombined||'unknown')+
       '\nReads '+c.rawCount+' | Errors '+c.failures+' | Lever mapping NOT verified');
   ui.text('DIAG_LOG',c.events.slice(-24).map(e=>e.ms+' ms '+e.kind+' '+JSON.stringify(e.value)).join('\n')+
      (exported?'\nSaved: '+exported:''));
 };
 const valid=()=>!closing&&enabled()&&!guard.reason()&&ui.isVisible('DIAGNOSTICS');
 const tick=async()=>{
   if(capture.active&&(!valid()||Date.now()-capture.started>=60000))stop('Capture ended: state change or time limit');
   if(capture.active&&!pending&&Date.now()-lastRead>=750){
      const id=generation;pending=true;lastRead=Date.now();
      try{
         if(!reader.index)await reader.identify();
         if(id!==generation||!capture.active||!valid())return;
         const t=Date.now(),r=await reader.stalk();
         if(id===generation&&capture.active&&valid())capture.raw(r,Date.now()-t);
      }catch(e){if(id===generation&&capture.active)capture.error(e)}
      finally{pending=false;update()}
   }
   update();
 };
 const handler=(id,fn)=>ui.onClick(id,()=>Promise.resolve().then(fn).catch(e=>{log.warn(String(e));ui.text('DIAG_STATE','ERROR: '+e.message)}));
 handler('BTN_DIAG',()=>ui.open('DIAGNOSTICS'));
 handler('BTN_START',()=>{
   if(!valid())throw Error('Enable diagnostic mode and park securely in P first');
   if(pending||capture.active)throw Error('Stop previous recording first');
   if(!reader.diag.available)throw Error('TASU unavailable');
   exported='';generation++;reader.index=null;lastRead=0;capture.start();update();
 });
 [['BTN_NEUTRAL','neutral / released'],['BTN_PULL','pull flasher'],['BTN_PUSH','push high beam'],['BTN_LATCH','continuous high beam / released']]
 .forEach(([id,x])=>handler(id,()=>{capture.mark(x);update()}));
 handler('BTN_STOP',()=>{stop('Stopped manually');update()});
 handler('BTN_SAVE',()=>{
   stop('Saved');const file=path.join(ctx.dataDir,'light-flasher-diagnostics.json');
   const report={app:'light_flasher',version:'0.1.0',at:new Date().toISOString(),guard:guard.snapshot(),
     bdcIndex:reader.index,physicalActuation:false,combinedSignal:lastCombined,capture:capture.snapshot()};
   fs.writeFileSync(file+'.tmp',JSON.stringify(report,null,2));fs.renameSync(file+'.tmp',file);exported=file;update();
 });
 handler('BTN_BACK',()=>{stop('Left diagnostics');return ui.open('MAIN')});
 const preview=()=>{
   const pattern=settings.get('pattern'),ms=Number(settings.get('interval')),hold=Number(settings.get('hold'));
   const recipe=({alternate:['L','R'],double:['L','L','R','R'],triple:['L','L','L','R','R','R'],together:['L+R','OFF']})[pattern]||['L','R'];
   ui.text('PREVIEW_INFO','Simulation ONLY | hold '+hold+' ms | step '+ms+' ms; not a physical timing guarantee.');
   ui.text('PREVIEW_TEXT',Array.from({length:12},(_,i)=>(i*ms)+' ms: '+recipe[i%recipe.length]).join('\n'));
   return ui.open('PREVIEW');
 };
 handler('BTN_PREVIEW',preview);handler('BTN_PREVIEW_BACK',()=>ui.open('MAIN'));
 settings.onChange(()=>{if(!enabled())stop('Disabled');update()});
 ui.onVisible(()=>{if(capture.active&&!ui.isVisible('DIAGNOSTICS'))stop('Left diagnostics');update()});
 if(ctx.app&&ctx.app.on)ctx.app.on('shutdown',()=>{closing=true;stop('Shutdown')});
 process.on('SIGTERM',()=>{closing=true;stop('Shutdown');process.exit(0)});
 guard.init(ctx.signals,log,v=>{lastCombined=v&&v.statusMainBeam_headlightFlasher;capture.status(v)}).catch(e=>log.warn(String(e)));
 reader.init().catch(e=>log.warn(String(e)));
 setInterval(()=>{tick().catch(e=>log.warn(String(e)))},250);
 update();
}});
