'use strict';
// ReadDataByIdentifier ONLY. No session changes, writes, routines or actuator commands.
const {Diag,replyTo}=require('./tasu');
const DID=[0xE3,0xB8], IDENT=[0xF1,0x50];
const hex=a=>Array.from(a||[]).map(x=>x.toString(16).toUpperCase().padStart(2,'0')).join(' ');
class Reader {
 constructor(signals,log){this.diag=new Diag(signals,log);this.diag.quiet=true;this.busy=false;this.index=null}
 async init(){await this.diag.init();return this}
 async read(did){
   if(did!==DID&&did!==IDENT)throw Error('Read-only DID not allowed');
   if(this.busy||!this.diag.available)throw Error('TASU unavailable or busy');
   this.busy=true;
   try{
     const reply=await this.diag.physical(0x40,0x22,did,500,replyTo(0x22,did),{maxRetries:0,callTimeoutMs:700,hardTimeoutMs:1200,pendingTimeoutMs:800});
     if(!reply||!reply.length)throw Error('Read timed out');
     if(reply[0]!==0x62||reply[1]!==did[0]||reply[2]!==did[1])throw Error('Read refused: '+hex(reply));
     return reply;
   }finally{this.busy=false}
 }
 async identify(){this.index=null;const r=await this.read(IDENT);this.index=hex(r.slice(3));if(this.index!=='0F 26 80')throw Error('Unsupported BDC identity: '+this.index);return this.index}
 async stalk(){if(this.index!=='0F 26 80')throw Error('Identify BDC first');return this.read(DID)}
}
class Capture{
 constructor(now=Date.now){this.now=now;this.active=false;this.events=[];this.reason='Not recorded';this.started=null;this.ended=null;this.lastStatus=null;this.lastRaw=null;this.rawCount=0;this.failures=0;}
 start(){this.active=true;this.events=[];this.reason='Recording';this.started=this.now();this.ended=null;this.lastStatus=null;this.lastRaw=null;this.rawCount=0;this.failures=0;}
 add(kind,value){if(!this.active)return;if(this.events.length>=300){this.stop('300 event limit');return}this.events.push({ms:this.now()-this.started,kind,value})}
 status(v){if(!this.active||!v)return;const x=v.statusMainBeam_headlightFlasher;if(x!==this.lastStatus){this.lastStatus=x;this.add('combined-light-status',v)}}
 raw(r,latencyMs){if(!this.active)return;this.rawCount++;const payload=hex(r.slice(3));if(payload!==this.lastRaw){this.lastRaw=payload;this.add('stalk-raw-change',{reply:hex(r),data:payload,latencyMs})}}
 error(e){if(!this.active)return;this.failures++;this.add('read-error',String(e.message||e));if(this.failures>=3)this.stop('Read failures; no session changes attempted')}
 mark(x){this.add('user-marker',x)}
 stop(reason='Stopped manually'){if(this.active){this.active=false;this.ended=this.now();this.reason=reason}}
 snapshot(){return {active:this.active,reason:this.reason,started:this.started,ended:this.ended,rawCount:this.rawCount,failures:this.failures,source:'BDC_G05 LENKSTOCK_BLINKER DID E3B8',leverVerified:false,events:this.events.slice()}}
}
module.exports={Reader,Capture,hex};
