import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { layoutBallsyArrivalLabels, BALLSY_LABEL_MAX_SHIFT } = await importBrowserModule(new URL("../src/ballsy-label-layout.ts", import.meta.url));
const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const halo=(x,y)=>({left:x-50,right:x+50,top:y-50,bottom:y+50});
function check(labels,viewport,blockers) {
  const result=layoutBallsyArrivalLabels(labels,viewport,blockers);
  assert.equal(result.length,labels.length);
  result.forEach((position,i)=>{
    assert.ok(position.box.left>=8&&position.box.top>=8&&position.box.right<=viewport.width-8&&position.box.bottom<=viewport.height-8);
    assert.ok(blockers.every(box=>!intersects(position.box,box)),JSON.stringify({position,blockers}));
    assert.ok(Math.hypot(position.x-labels[i].x,position.bottom-labels[i].bottom)<=BALLSY_LABEL_MAX_SHIFT+1e-8);
    assert.ok(result.every((other,j)=>j===i||!intersects(position.box,other.box)),JSON.stringify(result));
  });
  return result;
}
test("measured close-finish regression separates badges and preserves both halos",()=>{
  const labels=[{x:638.565,bottom:216,width:90.95,height:25},{x:618.785,bottom:239.58,width:93.75,height:25}];
  const blockers=[{left:0,right:1280,top:0,bottom:76},{left:24,right:194,top:80,bottom:157},{left:1070,right:1256,top:80,bottom:157},
    {left:400,right:880,top:433,bottom:708},halo(638.565,275),halo(618.785,300)];
  const result=check(labels,{width:1280,height:720},blockers);
  assert.equal(result[0].x,labels[0].x);
  assert.equal(result[1].x,labels[1].x,"prefer a small vertical correction over moving sideways");
});
test("mobile and short landscape badges avoid the scores, results and each other",()=>{
  for(const [width,height,balls,headerBottom,scoreBottom,cardTop] of [
    [390,844,[[195,320],[188,334]],64,137,490],
    [960,540,[[480,225],[490,245]],64,126,310],
    [844,390,[[422,150],[428,165]],60,115,203],
  ]) {
    const labels=balls.map(([x,y])=>({x,bottom:y-68,width:94,height:25}));
    const scoreWidth=width<500?133:174;
    check(labels,{width,height},[{left:0,right:width,top:0,bottom:headerBottom},
      {left:12,right:12+scoreWidth,top:70,bottom:scoreBottom},{left:width-12-scoreWidth,right:width-12,top:70,bottom:scoreBottom},
      {left:Math.max(12,(width-480)/2),right:Math.min(width-12,(width+480)/2),top:cardTop,bottom:height-12},...balls.map(([x,y])=>halo(x,y))]);
  }
});
test("an unconstrained label stays anchored and slot ordering does not hide a winner",()=>{
  const labels=[{x:220,bottom:190,width:94,height:25},{x:500,bottom:320,width:91,height:25}];
  const result=check(labels,{width:800,height:600},[]);
  assert.deepEqual(result.map(({x,bottom})=>({x,bottom})),labels.map(({x,bottom})=>({x,bottom})));
  check([{x:300,bottom:190,width:94,height:25},{x:300,bottom:190,width:91,height:25}],{width:800,height:600},[]);
});
test("viewport edges clamp badges rather than clipping text",()=>{
  const result=layoutBallsyArrivalLabels([{x:2,bottom:10,width:94,height:25},{x:388,bottom:842,width:94,height:25}],{width:390,height:844},[]);
  assert.ok(result.every(p=>p.box.left>=8&&p.box.right<=382&&p.box.top>=8&&p.box.bottom<=836));
});
