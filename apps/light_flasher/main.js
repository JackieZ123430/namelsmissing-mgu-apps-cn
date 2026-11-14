'use strict';
const mgu=require('./kit/mgu'),fs=require('fs'),path=require('path');
const Guard=require('./guard');
const {Reader,Capture}=require('./probe');
mgu.run({async start(ctx){
 const {ui,settings,log}=ctx, capture=new Capture(),reader=new Reader(ctx.signals,log);
 let lastCombined=null, lastRead=0, pending=false, generation=0, exported='', closing=false, connectionState='Not checked', lastError='';
 const feedback=[];let feedbackStatus='No FLM samples recorded';
 const enabled=()=>settings.get('enabled')===true;
 const guard=new Guard(Date.now,()=>{});
 const stop=(why)=>{generation++;capture.stop(why);};
 const update=()=>{
   const g=guard.snapshot(),c=capture.snapshot();
   ui.text('STATUS',(enabled()?'Diagnostic mode ON':'Diagnostic mode OFF')+' | physical flashing unavailable');
   if(ui.isVisible('FLM_FEEDBACK')){
     ui.text('FB_STATUS',feedbackStatus+' | '+(g.blockedBy||'P / stationary')+' | Combined light: '+(lastCombined||'unknown')+'\n'+(lastError||'Read-only, no light commands'));
     ui.text('FB_LOG',feedback.slice(-3).map(f=>f.label+' | '+f.before+' -> '+f.after+'\n'+f.results.map(z=>z.side+' '+(z.did||z.kind)+' '+(z.error||z.reply)).join('\n')).join('\n\n')+(exported?'\nSaved: '+exported:''));
   }
   if(!ui.isVisible('DIAGNOSTICS'))return;
   ui.text('DIAG_STATE',c.reason+' | '+connectionState+
       '\nTASU: '+(reader.diag.available?'available':(reader.diag.error||'not available'))+
       ' | BDC: '+(reader.index||'not verified')+
       '\nDiagnostic mode '+(enabled()?'ON':'OFF')+' | '+(g.blockedBy||'P / stationary')+
       '\nCombined light: '+(lastCombined||'unknown')+' | Reads '+c.rawCount+' | Errors '+c.failures+
       (lastError?'\nERROR: '+lastError:''));
   ui.text('DIAG_LOG',reader.trace.slice(-8).map(x=>x.tx+' => '+(x.rx||x.error||'waiting')+(x.error?' | '+x.error:'')).join('\n')+
      '\n'+c.events.slice(-24).map(e=>e.ms+' ms '+e.kind+' '+JSON.stringify(e.value)).join('\n')+
      (exported?'\nSaved: '+exported:''));
 };
 const safe=()=>!closing&&enabled()&&!guard.reason();
 const valid=()=>safe()&&ui.isVisible('DIAGNOSTICS');
 const validFeedback=()=>safe()&&ui.isVisible('FLM_FEEDBACK');
 const tick=async()=>{
   if(capture.active&&(!valid()||Date.now()-capture.started>=60000))stop('Capture ended: state change or time limit');
   if(capture.active&&!pending&&Date.now()-lastRead>=750){
      const id=generation;pending=true;lastRead=Date.now();
      try{
         if(!reader.index){stop('BDC connection lost; check connection again');connectionState='Disconnected';return;}
         if(id!==generation||!capture.active||!valid())return;
         const t=Date.now(),r=await reader.stalk();
         if(id===generation&&capture.active&&valid())capture.raw(r,Date.now()-t);
      }catch(e){if(id===generation&&capture.active){lastError=String(e.message||e);capture.error(e)}}
      finally{pending=false;update()}
   }
   update();
 };
 const handler=(id,fn)=>ui.onClick(id,()=>Promise.resolve().then(fn).catch(e=>{lastError=String(e.message||e);log.warn(lastError);update()}));
 handler('BTN_DIAG',()=>ui.open('DIAGNOSTICS'));
 async function checkConnection(startCapture){
   if(!valid())throw Error('Enable diagnostic mode and park in P: '+(guard.reason()||'diagnostic mode/page not enabled'));
   if(pending||capture.active)throw Error('Stop previous recording or wait for current read');
   lastError='';exported='';
   if(!reader.diag.available){connectionState='TASU unavailable';throw Error(reader.diag.error||'TASU provider unavailable; no BDC request sent')}
   const token=++generation;pending=true;connectionState='Identifying BDC (22 F1 50)';update();
   try{
     await reader.identify();
     if(token!==generation||!valid())return;
     connectionState='BDC identified; checking 22 E3 B8';update();
     const t=Date.now(),raw=await reader.stalk();
     if(token!==generation||!valid())return;
     connectionState='BDC and E3B8 read OK';
     if(startCapture){capture.start();capture.raw(raw,Date.now()-t);lastRead=Date.now()}
   }catch(e){if(token===generation){connectionState=reader.index?'BDC OK; E3B8 failed':'BDC identification failed';lastError=String(e.message||e);log.warn(lastError)}}
   finally{pending=false;update()}
 }
 handler('BTN_CHECK',()=>checkConnection(false));
 handler('BTN_START',()=>checkConnection(true));
 [['BTN_NEUTRAL','neutral / released'],['BTN_PULL','pull flasher'],['BTN_PUSH','push high beam'],['BTN_LATCH','continuous high beam / released']]
 .forEach(([id,x])=>handler(id,()=>{capture.mark(x);update()}));
 handler('BTN_STOP',()=>{stop('Stopped manually');update()});
 function saveReport(){
   if(pending)throw Error('Wait for the read to finish before saving');
   stop('Saved');const file=path.join(ctx.dataDir,'light-flasher-diagnostics.json');
   const report={app:'light_flasher',version:'0.1.2',at:new Date().toISOString(),guard:guard.snapshot(),
     bdcIndex:reader.index,identityReply:reader.identityReply,connectionState,lastError,
     tasuAvailable:reader.diag.available,tasuError:reader.diag.error||null,trace:reader.trace.slice(),
     physicalActuation:false,combinedSignal:lastCombined,capture:capture.snapshot(),flmFeedback:feedback.slice(),feedbackStatus};
   fs.writeFileSync(file+'.tmp',JSON.stringify(report,null,2));fs.renameSync(file+'.tmp',file);exported=file;update();
 }
 handler('BTN_SAVE',saveReport);
 handler('BTN_FB_SAVE',saveReport);
 handler('BTN_BACK',()=>{stop('Left diagnostics');return ui.open('MAIN')});
 handler('BTN_FEEDBACK',()=>{if(pending||capture.active)throw Error('Stop other capture first');return ui.open('FLM_FEEDBACK')});
 async function sampleFeedback(label){
   if(!validFeedback())throw Error('Enable diagnostics and park in P');
   if(pending||capture.active)throw Error('Another read is in progress');
   if(!reader.diag.available)throw Error('TASU unavailable');
   pending=true;lastError='';exported='';
   const token=++generation,sample={label,at:new Date().toISOString(),before:lastCombined,after:null,results:[],complete:false};
   feedback.push(sample);if(feedback.length>12)feedback.shift();
   feedbackStatus='Reading '+label+'; wait for completion';update();
   const allowed=()=>token===generation&&validFeedback();
   try{
     await reader.flmFeedback(allowed,z=>{sample.results.push({...z,at:new Date().toISOString(),combinedSignal:lastCombined});update()});
     sample.complete=allowed()&&sample.results.filter(x=>x.kind==='feedback').length===6;
   }finally{
     sample.after=lastCombined;sample.endedAt=new Date().toISOString();
     feedbackStatus=sample.complete?'Sample complete; raw feedback not decoded':'Sample incomplete; inspect replies or errors';
     pending=false;update();
   }
 }
 [['BTN_FB_OFF','OEM high beam off'],['BTN_FB_ON','OEM steady high beam on'],['BTN_FB_RELEASE','OEM high beam off again']].forEach(([id,label])=>handler(id,()=>sampleFeedback(label)));
 handler('BTN_FB_BACK',()=>{stop('Left FLM feedback');return ui.open('DIAGNOSTICS')});
 const preview=()=>{
   const pattern=settings.get('pattern'),ms=Number(settings.get('interval')),hold=Number(settings.get('hold'));
   const recipe=({alternate:['L','R'],double:['L','L','R','R'],triple:['L','L','L','R','R','R'],together:['L+R','OFF']})[pattern]||['L','R'];
   ui.text('PREVIEW_INFO','Simulation ONLY | hold '+hold+' ms | step '+ms+' ms; not a physical timing guarantee.');
   ui.text('PREVIEW_TEXT',Array.from({length:12},(_,i)=>(i*ms)+' ms: '+recipe[i%recipe.length]).join('\n'));
   return ui.open('PREVIEW');
 };
 handler('BTN_PREVIEW',preview);handler('BTN_PREVIEW_BACK',()=>ui.open('MAIN'));
 settings.onChange(()=>{if(!enabled())stop('Disabled');update()});
 ui.onVisible(()=>{if((capture.active||pending)&&!ui.isVisible('DIAGNOSTICS')&&!ui.isVisible('FLM_FEEDBACK'))stop('Left diagnostics');update()});
 if(ctx.app&&ctx.app.on)ctx.app.on('shutdown',()=>{closing=true;stop('Shutdown')});
 process.on('SIGTERM',()=>{closing=true;stop('Shutdown');process.exit(0)});
 guard.init(ctx.signals,log,v=>{lastCombined=v&&v.statusMainBeam_headlightFlasher;capture.status(v)}).catch(e=>log.warn(String(e)));
 reader.init().catch(e=>log.warn(String(e)));
 setInterval(()=>{tick().catch(e=>log.warn(String(e)))},250);
 update();
}});
