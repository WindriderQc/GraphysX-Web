import { test } from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { frameBallsyCamera, ballsyCameraEnvelope } = await importBrowserModule(new URL("../src/ballsy-camera.ts", import.meta.url));
const { coursePoint, courseEdge, COURSE_MAIN } = await importBrowserModule(new URL("../src/ballsy-course.ts", import.meta.url));
const sizes = [[1280,720], [1920,1080], [390,844], [320,568], [844,390]];
const pose = t => { const p = coursePoint(t); return [p.x, p.y + .65, p.z]; };
const view = (width, height) => ({ width, height, fov:55, inset:{top:Math.min(155,height*.24),right:28,bottom:76,left:28} });
function cameraFor(frame, viewport) {
  const c = new PerspectiveCamera(viewport.fov, viewport.width / viewport.height, .1, 260);
  c.position.fromArray(frame.position); c.lookAt(new Vector3(...frame.target)); c.updateMatrixWorld();
  return c;
}
function checkContained(frame, points, viewport) {
  const camera = cameraFor(frame, viewport);
  for(const p of points) {
    const v = new Vector3(...p).project(camera), x=(v.x+1)*viewport.width/2,y=(1-v.y)*viewport.height/2;
    assert.ok(x >= viewport.inset.left - 1e-7 && x <= viewport.width - viewport.inset.right + 1e-7, `x ${x}`);
    assert.ok(y >= viewport.inset.top - 1e-7 && y <= viewport.height - viewport.inset.bottom + 1e-7, `y ${y}`);
  }
}
test("close racers gain visible diameter over the old ocean-wide framing in every format", () => {
  for(const [w,h] of sizes) {
    const viewport=view(w,h), positions=[pose(.02),pose(.025)];
    const frame=frameBallsyCamera(positions.flatMap(p=>ballsyCameraEnvelope(p,6)),positions.flatMap(p=>ballsyCameraEnvelope(p)),viewport);
    checkContained(frame,positions.flatMap(p=>ballsyCameraEnvelope(p)),viewport);
    const old = new PerspectiveCamera(55,w/h,.1,260), scale=Math.max(1,1.4/Math.max(.3,w/h));
    old.position.set(0,63*scale,47*scale);old.lookAt(0,0,-2);old.updateMatrixWorld();
    const diameter=c=>{const p=positions[0],a=new Vector3(p[0]-.65,p[1],p[2]).project(c),b=new Vector3(p[0]+.65,p[1],p[2]).project(c);return (b.x-a.x)*w/2;};
    assert.ok(diameter(cameraFor(frame,viewport)) > diameter(old)*1.8, `visible close-race gain at ${w}x${h}`);
  }
});
test("both whole balls fit at opposite points, raised bends and portrait/landscape sizes",()=>{
  for(const [w,h] of sizes)for(const t of [0,.2,.45,.65,.8]) {
    const viewport=view(w,h),positions=[pose(t),pose(t+.5)],safety=positions.flatMap(p=>ballsyCameraEnvelope(p));
    const frame=frameBallsyCamera(positions.flatMap(p=>ballsyCameraEnvelope(p,6)),safety,viewport);
    checkContained(frame,safety,viewport);
  }
});
test("ordinary separation, convergence and bends remain smooth and never clip a ball",()=>{
  for(const [w,h] of sizes) {
    const viewport=view(w,h);let frame=null,maxStep=0;
    for(let i=0;i<1600;i++) {
      const t=i*.00055,positions=[pose(t),pose(t*.55+.01)],safety=positions.flatMap(p=>ballsyCameraEnvelope(p));
      const next=frameBallsyCamera(positions.flatMap(p=>ballsyCameraEnvelope(p,6)),safety,viewport,frame,1/60);
      if(frame)maxStep=Math.max(maxStep,Math.hypot(...next.position.map((v,k)=>v-frame.position[k])));
      checkContained(next,safety,viewport);frame=next;
    }
    assert.ok(maxStep<.9,`normal movement has no camera cut: ${w}x${h} ${maxStep}`);
  }
});
test("overview fits the authored road edges, not the ocean, and resets deterministically",()=>{
  const points=COURSE_MAIN.filter((_,i)=>i%8===0).flatMap(p=>[courseEdge(p,-p.width/2-1),courseEdge(p,p.width/2+1)]);
  for(const [w,h]of sizes) {
    const viewport=view(w,h),frame=frameBallsyCamera(points,points,viewport);
    checkContained(frame,points,viewport);
    assert.deepEqual(frameBallsyCamera(points,points,viewport,frame,1/60),frame);
  }
});
test("resize/recovery containment is immediate; zero-time paused framing does not drift",()=>{
  const viewport=view(1280,720),points=ballsyCameraEnvelope(pose(0),6),safety=ballsyCameraEnvelope(pose(0));
  const before=frameBallsyCamera(points,safety,viewport);
  assert.deepEqual(frameBallsyCamera(points,safety,viewport,before,0),before);
  const far=ballsyCameraEnvelope(pose(.5)),narrow=view(390,844);
  const after=frameBallsyCamera([...points,...far],[...safety,...far],narrow,before,1/60);
  checkContained(after,[...safety,...far],narrow);
});
