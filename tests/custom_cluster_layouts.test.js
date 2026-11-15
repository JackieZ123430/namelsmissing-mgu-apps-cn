'use strict';
const assert=require('assert');
const EventEmitter=require('events');
const L=require('../apps/custom_cluster/layout_panels');
class Canvas {
    constructor(w,h){this.d=new Uint8Array(w*h*4);this.labels=[];}
    clear(){return this;} circle(){return this;} arc(){return this;}
    line(){return this;} fillRect(){return this;} roundRect(){return this;}
    drawImage(){return this;} text(s){this.labels.push(String(s));return this;}
}
function fixture(){
    const layers=new Map(),ops=[];let next=0;
    function add(kind,o){const r=++next;layers.set(r,{kind,o:Object.assign({},o)});ops.push([kind,r]);return r;}
    return {layers,ops,image:o=>add('image',o),effect:o=>add('effect',o),
        pixels(r,rects,p){ops.push(['pixels',r]);const o=layers.get(r).o;return p.length===o.iw*o.ih*4;},
        uniform(r,n,v){ops.push(['uniform',r,n,v.slice()]);},set(r,o){ops.push(['set',r]);Object.assign(layers.get(r).o,o);}};
}
for(const layout of Object.keys(L.NAMES)){
    const cr=fixture(),refs=[];
    const parts=L.buildLayout(cr,'panel',{speed:0,rpm:790},{layout},[.4,.2,1,1],'#6633ff',r=>refs.push(r),Canvas);
    assert.equal(refs.length,layout==='minimal'?4:6,layout);
    for(const {o} of cr.layers.values()){
        assert.equal(o.visible,false);assert.equal(o.contend,false);
        assert.ok(o.x+o.w<=416||o.x>=1504,layout+' centre clearance');
        assert.ok(o.y+o.h<600,layout+' bottom clearance');
    }
    const before=cr.ops.length;
    L.updateLayout(cr,parts,{speed:0,rpm:790},[.4,.2,1,1],'#6633ff');
    assert.equal(cr.ops.length,before,'unchanged values do not upload');
    L.updateLayout(cr,parts,{speed:0,rpm:1500},[.4,.2,1,1],'#6633ff');
    assert.ok(cr.ops.slice(before).some(x=>x[0]==='pixels'),'RPM update');
    assert.throws(()=>L.updateLayout(cr,parts,{speed:NaN,rpm:1500},[.4,.2,1,1],'#6633ff'),/Invalid live speed/);
    L.drawLayoutPreview(new Canvas(1600,520),{x:38,y:86,w:1042,h:398},{speed:0,rpm:790},{layout},'#6633ff',Canvas);
}
const side=L.SIDES[0],ticks=L.ticks('oem',side);
assert.deepStrictEqual(ticks,[0,20,40,60,100,140,200,260]);
assert.equal(L.fraction('oem',side,0),0);
assert.equal(L.fraction('oem',side,260),1);
assert.ok(L.face('oem',side,'#6633ff',Canvas).labels.includes('140'));
console.log('All five shared side-layout paths, preview and geometry checks passed');
