'use strict';
const mgu=require('./kit/mgu'),fs=require('fs'),path=require('path');
const Guard=require('./guard');
const {Reader,Capture}=require('./probe');
const Feedback=require('./feedback');
const ManualFlash=require('./manual-flash');
const {config}=require('./flash-config');
const Monitor=require('./background-monitor');
const Transport=require('./transport-probe');
mgu.run({async start(ctx){
 const {ui,settings,log}=ctx, capture=new Capture(),reader=new Reader(ctx.signals,log);
 const monitor=new Monitor(Date.now,ctx.app&&ctx.app.startReason);
 monitor.setEnabled(settings.get('backgroundMonitor')===true);
 if(ui.isVisible('MAIN'))monitor.seeMain();
 log.info('Light Flasher startup: '+JSON.stringify(monitor.snapshot()));
 let lastCombined=null, lastRead=0, pending=false, generation=0, exported='', closing=false, connectionState='Not checked', lastError='';
 const feedback=[];let feedbackStatus='No FLM samples recorded';
 const transportTests=[];let transportStatus='No transport test recorded',transportInterval=20,transportRun=0,transportCancel=false;
 const intervals=[20,40,60,80,100,150,200,300,500,1000];
 const bgFile=path.join(ctx.dataDir,'light-flasher-background.json');let lastBg='',bgError='';
 const persistBackground=()=>{try{const bg=monitor.snapshot();const raw=JSON.stringify(bg);if(raw!==lastBg){fs.writeFileSync(bgFile+'.tmp',JSON.stringify({...bg,version:'0.1.8',pid:process.pid,writtenAt:new Date().toISOString()},null,2));fs.renameSync(bgFile+'.tmp',bgFile);lastBg=raw;}bgError='';}catch(e){bgError=String(e.message||e);}};
 persistBackground();
 const enabled=()=>settings.get('enabled')===true;
 const guard=new Guard(Date.now,()=>{});
 const getConfig=()=>config(settings.get('pattern'),settings.get('interval'),settings.get('hold'));
 const marker=path.join(ctx.dataDir,'manual-flash-pending.json');
 const journal={exists:()=>fs.existsSync(marker),mark:()=>fs.writeFileSync(marker,JSON.stringify({at:new Date().toISOString()}),{flag:'wx'}),clear:()=>fs.unlinkSync(marker)};
 const flash=new ManualFlash(reader.diag,log,undefined,Date.now,journal);let lastLightAt=0,flashTask=null;
 const stop=(why)=>{generation++;capture.stop(why);};
 const update=()=>{
   const g=guard.snapshot(),c=capture.snapshot();
   if(ui.isVisible('MAIN')){
     ui.text('STATUS',(enabled()?'Diagnostic mode ON':'Diagnostic mode OFF')+' | manual parked flash '+(settings.get('manualFlash')===true?'enabled':'disabled'));
     const bg=monitor.snapshot();
     ui.text('BG_STATUS','Background monitor '+(bg.enabled?'ON':'OFF')+' | '+bg.startReason+' | Before first opening: '+bg.observedBeforeOpen+' | '+(bg.lastCombinedSignal||'no parked signal')+' (read only)'+(bgError?' | log error: '+bgError:''));
     let text;try{const c=getConfig();text=c.label+' | '+c.intervalMs+' ms '+(c.previewOnly?'transport test only':'requested')+' | '+c.durationMs/1000+' s'}catch(e){text='Invalid flash settings'}
     ui.text('FLASH_CONFIG',text);
     ui.text('FLASH_STATUS',(flash.cleanupUnconfirmed?'LOCKED: previous cleanup not confirmed':flash.status)+' | '+(g.blockedBy||'P / stationary')+' | OEM beam '+(lastCombined||'unknown')+(lastError?' | '+lastError:''));
   }
   if(ui.isVisible('FLM_FEEDBACK')){
     ui.text('FB_STATUS',feedbackStatus+' | '+(g.blockedBy||'P / stationary')+' | Combined light: '+(lastCombined||'unknown')+'\n'+(lastError||'Read-only, no light commands'));
     ui.text('FB_LOG',feedback.slice(-3).map(f=>{
       const d=Feedback.sampleState(f);
       return f.label+' | '+f.before+' -> '+f.after+' | '+(d.consistent?'consistent':'not confirmed')+'\n'+
         Object.entries(d.sides).map(([side,x])=>side+' CH8: '+x.highBeam.pwmPercent+'% / '+x.highBeam.currentMa+' mA / '+x.highBeam.voltageV+' V | CH7: '+x.lowBeam.pwmPercent+'%').join('\n')+
         '\n'+f.results.map(z=>z.side+' '+(z.did||z.kind)+' '+(z.error||z.reply)).join('\n');
     }).join('\n\n')+(exported?'\nSaved: '+exported:''));
   }
   if(ui.isVisible('TRANSPORT')){
     ui.text('TP_STATUS','Selected test: '+transportInterval+' ms | '+transportStatus+' | '+(g.blockedBy||'P / stationary')+(lastError?' | '+lastError:''));
     ui.text('TP_LOG',transportTests.slice(-4).reverse().map(t=>'Test #'+t.run+' | Requested '+t.requestedIntervalMs+' ms | actual gap '+t.actualDispatchGapMs+' ms | both replies '+t.bothIdentitiesReceived+'\n'+t.records.map(r=>r.side+' send '+r.sentMs+' ms | verdict '+(r.verdict||r.error||'not sent')+' @ '+r.verdictMs+' ms | ECU reply '+(r.reply||'none')+(r.replyMs===undefined?'':' @ '+r.replyMs+' ms')).join('\n')).join('\n\n')+(exported?'\nSaved: '+exported:''));
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
   monitor.observe(Date.now()-lastLightAt<=2500?{statusMainBeam_headlightFlasher:lastCombined}:null,!guard.reason(),ui.isVisible('MAIN'));persistBackground();
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
 const flashAllowed=()=>!closing&&settings.get('manualFlash')===true&&ui.isVisible('MAIN')&&!guard.reason()&&lastCombined==='AUS'&&Date.now()-lastLightAt<=2500;
 handler('BTN_FLASH',async()=>{
   if(pending||capture.active||flash.running)throw Error('Another operation in progress');
   if(!flashAllowed())throw Error('Park securely in P, enable manual flash and switch OEM high beam OFF');
   lastError='';pending=true;
   try{flashTask=flash.run(getConfig(),flashAllowed,update);await flashTask}
   finally{flashTask=null;pending=false;update()}
 });
 handler('BTN_FLASH_STOP',()=>{flash.cancel();update()});
 handler('BTN_DIAG',()=>{if(flash.running)throw Error('Stop manual flash first');return ui.open('DIAGNOSTICS')});
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
   const report={app:'light_flasher',version:'0.1.8',at:new Date().toISOString(),guard:guard.snapshot(),
     bdcIndex:reader.index,identityReply:reader.identityReply,connectionState,lastError,
     tasuAvailable:reader.diag.available,tasuError:reader.diag.error||null,trace:reader.trace.slice(),
     physicalActuation:flash.trace.some(x=>x.tx.startsWith('3101')),manualFlash:{status:flash.status,trace:flash.trace.slice(),cleanupUnconfirmed:flash.cleanupUnconfirmed,config:flash.config,stepsCompleted:flash.stepsCompleted,elapsedMs:flash.elapsedMs},combinedSignal:lastCombined,capture:capture.snapshot(),flmFeedback:feedback.slice(),decodedFeedback:feedback.map(Feedback.sampleState),overrideReadiness:Feedback.limits,backgroundMonitor:monitor.snapshot(),transportTests:transportTests.slice(),feedbackStatus};
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
     feedbackStatus=sample.complete?'Sample complete; electrical readback only':'Sample incomplete; inspect replies or errors';
     pending=false;update();
   }
 }
 [['BTN_FB_OFF','OEM high beam off'],['BTN_FB_ON','OEM steady high beam on'],['BTN_FB_RELEASE','OEM high beam off again']].forEach(([id,label])=>handler(id,()=>sampleFeedback(label)));
 handler('BTN_FB_BACK',()=>{stop('Left FLM feedback');return ui.open('DIAGNOSTICS')});
 handler('BTN_TRANSPORT',()=>{if(pending||capture.active||flash.running)throw Error('Stop other operation first');transportInterval=getConfig().intervalMs;return ui.open('TRANSPORT')});
 handler('BTN_TP_NEXT',()=>{if(pending)throw Error('Test running');transportInterval=intervals[(intervals.indexOf(transportInterval)+1)%intervals.length];lastError='';transportStatus='Ready for new test';update()});
 handler('BTN_TP_CANCEL',()=>{transportCancel=true;transportStatus='Cancel requested; waiting for pending read';update()});
 async function runTransport(sweep){
   const allowed=()=>!transportCancel&&safe()&&ui.isVisible('TRANSPORT')&&reader.diag.available;
   if(pending||capture.active||flash.running||reader.busy)throw Error('Another operation in progress');
   transportCancel=false;
   if(!allowed())throw Error('Enable diagnostics and select P');
   pending=true;lastError='';exported='';
   const steps=sweep?intervals.filter(x=>x<=500):[transportInterval];
   try{
     for(const ms of steps){
       if(!allowed())break;
       transportInterval=ms;const run=++transportRun;transportStatus='Running test #'+run+' at '+ms+' ms';update();
       const result=await Transport.probe(reader.diag,ms,allowed);result.run=run;
       transportTests.push(result);if(transportTests.length>24)transportTests.shift();
       transportStatus='Test #'+run+' at '+ms+' ms: '+(result.cancelled?'cancelled':result.bothIdentitiesReceived?'both replies received':'refused or reply missing');update();
       if(result.cancelled||!result.records[0].identityMatches||result.records.some(r=>r.transportAccepted&&!r.identityMatches))break;
       if(sweep&&ms!==steps[steps.length-1])await new Promise(resolve=>setTimeout(resolve,750));
     }
     if(transportCancel)transportStatus='Cancelled; requests drained';
   }catch(e){transportStatus='Test failed';throw e}
   finally{pending=false;update()}
 }
 handler('BTN_TP_START',()=>runTransport(false));
 handler('BTN_TP_SWEEP',()=>runTransport(true));
 handler('BTN_TP_SAVE',saveReport);
 handler('BTN_TP_BACK',()=>{if(pending)throw Error('Wait for read-only test to finish');return ui.open('MAIN')});
 settings.onChange(()=>{monitor.setEnabled(settings.get('backgroundMonitor')===true);persistBackground();if(!enabled())stop('Disabled');if(flash.running||settings.get('manualFlash')!==true)flash.cancel();update()});
 ui.onVisible(()=>{if(ui.isVisible('MAIN'))monitor.seeMain();else flash.cancel();persistBackground();if((capture.active||pending&&!flash.running)&&!ui.isVisible('DIAGNOSTICS')&&!ui.isVisible('FLM_FEEDBACK')&&!ui.isVisible('TRANSPORT'))stop('Left diagnostics');update()});
 if(ctx.app&&ctx.app.on)ctx.app.on('shutdown',()=>{closing=true;flash.cancel();stop('Shutdown')});
 process.on('SIGTERM',()=>{closing=true;flash.cancel();stop('Shutdown');if(flashTask){const timer=setTimeout(()=>process.exit(1),10000);flashTask.catch(()=>{}).then(()=>{clearTimeout(timer);process.exit(0)});}else process.exit(0)});
 guard.init(ctx.signals,log,v=>{lastCombined=v&&v.statusMainBeam_headlightFlasher;lastLightAt=Date.now();monitor.observe(v,!guard.reason(),ui.isVisible('MAIN'));persistBackground();capture.status(v)}).catch(e=>log.warn(String(e)));
 reader.init().catch(e=>log.warn(String(e)));
 setInterval(()=>{tick().catch(e=>log.warn(String(e)))},250);
 update();
}});
