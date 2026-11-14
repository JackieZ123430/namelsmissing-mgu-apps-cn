'use strict';
// Read-only recorder. Raw light STATUS is NOT a verified lever input.
// No light commands, timers driving actuators, or automatic trigger.
class LightProbe {
    constructor(now=Date.now) {
        this.now=now; this.active=false; this.startAt=null; this.endAt=null;
        this.events=[]; this.count=0; this.lastRaw=null; this.lastAt=null;
        this.truncated=false; this.reason='Not recorded';
    }
    start() {
        this.active=true; this.startAt=this.now(); this.endAt=null;
        this.events=[];this.count=0;this.lastRaw=null;this.lastAt=null;
        this.truncated=false;this.reason='Recording';
    }
    tick() { if(this.active && this.now()-this.startAt>=60000)this.stop('60-second limit'); }
    append(kind,value) {
        if(!this.active)return;
        this.tick();if(!this.active)return;
        if(this.events.length>=500){this.truncated=true;this.stop('500-event limit');return;}
        this.events.push({ms:this.now()-this.startAt,kind,value});
    }
    feed(raw) {
        if(!this.active)return;
        this.tick();if(!this.active)return;
        let encoded;
        try{encoded=JSON.stringify(raw);}catch(_){return;}
        if(typeof encoded!=='string'||encoded.length>4096)return;
        this.count++;this.lastAt=this.now();
        if(encoded!==this.lastRaw){
            this.lastRaw=encoded;
            this.append('raw-change',JSON.parse(encoded));
        }
    }
    mark(value) { if(this.active && ['released','pulled','held over 3s','high beam latched'].includes(value))this.append('user-marker',value); }
    stop(reason='Stopped manually') {
        if(!this.active)return;
        this.active=false;this.endAt=this.now();this.reason=reason;
    }
    snapshot() {
        return {source:'de.bmw.infotainment.vehicle.Vehicle2/1/statusLightStatus',leverVerified:false,
            active:this.active,startAt:this.startAt,endAt:this.endAt,reason:this.reason,
            sampleCount:this.count,lastSampleAt:this.lastAt,truncated:this.truncated,events:this.events.slice()};
    }
}
module.exports=LightProbe;
