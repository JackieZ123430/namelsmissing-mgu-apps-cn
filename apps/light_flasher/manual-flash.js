'use strict';
// Manual parked one-shot only. Never override an active OEM beam, never start on bookmark/app launch.
// Fixed, previously used FLM02 channel 8, 60% PWM, ECU timer 1 second.
// Transport is serialized, so left/right are sequential, not synchronized.
const {replyTo}=require('./tasu');
const units=Object.freeze([{address:0x43,index:'0F26C0',side:'left'},{address:0x44,index:'0F26D0',side:'right'}]);
const hex=b=>Array.from(b||[]).map(x=>x.toString(16).padStart(2,'0').toUpperCase()).join('');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class ManualFlash {
 constructor(diag,log,sleep=wait){this.diag=diag;this.log=log;this.sleep=sleep;this.running=false;this.cancelled=false;this.trace=[];this.status='Idle';this.cleanupUnconfirmed=false;}
 cancel(){this.cancelled=true;}
 async run(allowed,changed=()=>{}){
  if(this.running)throw Error('Flash already running');
  if(this.cleanupUnconfirmed)throw Error('Previous cleanup unconfirmed: inspect normal lights and restart app');
  if(!allowed()||!this.diag.available)throw Error('Enable parked flash, select P and switch OEM high beam OFF');
  this.running=true;this.cancelled=false;this.trace=[];this.status='Checking FLM identities';changed();
  const check=()=>{if(this.cancelled||!allowed()||!this.diag.available)throw Error('Cancelled or park/OEM-light guard changed')};
  const send=async(m,sid,data,cleanup=false)=>{
   if(!cleanup)check();
   const rec={at:new Date().toISOString(),side:m.side,tx:hex([sid,...data])};this.trace.push(rec);
   try{
    if(!this.diag.available)throw Error('TASU unavailable');
    const u=await this.diag.physical(m.address,sid,data,800,replyTo(sid,data),{maxRetries:0,callTimeoutMs:1000,hardTimeoutMs:1800,pendingTimeoutMs:1000});
    rec.rx=u?hex(u):'TIMEOUT';
    if(!u||u[0]!==sid+0x40||!replyTo(sid,data)(u))throw Error('FLM '+m.side+' '+rec.tx+' reply '+rec.rx);
    return u;
   }catch(e){rec.error=String(e.message||e);throw e}
  };
  try{
   for(const m of units){const u=await send(m,0x22,[0xF1,0x50]);if(hex(u.slice(3))!==m.index)throw Error('Unsupported '+m.side+' FLM identity');}
   for(const m of units){
    let sessionAttempted=false,startAttempted=false;
    try{
     check();sessionAttempted=true;await send(m,0x10,[0x03]);
     check();this.status='One-shot '+m.side;changed();startAttempted=true;
     await send(m,0x31,[0x01,0xA5,0x4B,8,60,1]);
     // Do not rely on MGU timing for hard timeout; ECU routine is limited to 1 s.
     for(let i=0;i<3;i++){await this.sleep(100);check();}
    }finally{
     if(startAttempted){try{await send(m,0x31,[0x02,0xA5,0x4B],true)}catch(e){this.cleanupUnconfirmed=true;this.log.warn(String(e));}}
     if(sessionAttempted){try{await send(m,0x10,[0x01],true)}catch(e){this.cleanupUnconfirmed=true;this.log.warn(String(e));}}
    }
    if(this.cleanupUnconfirmed)throw Error('Cleanup not confirmed; no further flash allowed');
    check();await this.sleep(300);
   }
   this.status='One-shot complete; cleanup replies OK (verify lamps visually)';
  }catch(e){this.status='Stopped: '+String(e.message||e);throw e;}
  finally{this.running=false;changed();}
 }
}
module.exports=ManualFlash;
