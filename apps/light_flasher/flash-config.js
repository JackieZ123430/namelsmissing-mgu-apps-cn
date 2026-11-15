'use strict';
// One settings source for manual parked test and simulation. Existing saved keys retained.
const LABELS={alternate:'Alternate L/R',double:'Double L/R',triple:'Triple L/R',together:'Both together'};
const PATTERNS={alternate:[['left'],['right']],double:[['left'],['left'],['right'],['right']],triple:[['left'],['left'],['left'],['right'],['right'],['right']],together:[['left','right']]};
function config(pattern,interval,hold){
 if(!Object.prototype.hasOwnProperty.call(PATTERNS,pattern))throw Error('Invalid flash pattern');
 const intervalMs=Number(interval),durationMs=Number(hold);
 if(![20,40,60,80,100,150,200,300,500,1000].includes(intervalMs)||![2000,3000,4000,5000].includes(durationMs))throw Error('Invalid flash timing');
 return {pattern,label:LABELS[pattern],intervalMs,durationMs,previewOnly:intervalMs<100,steps:PATTERNS[pattern].map(x=>x.slice())};
}
module.exports={config};