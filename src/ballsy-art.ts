import type { AgentWorldInlineMesh, AgentWorldTexture } from "./agent-world-runtime";

/** Tiny deterministic, portable native material. No image requests or runtime uploads. */
export function ballsyAsphaltTexture(normal = false): AgentWorldTexture {
  const rgba: number[] = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const grain = ((x * 73 + y * 151 + x * y * 37) % 29) - 14;
    if (normal) rgba.push(128 + Math.round(grain / 2), 128 + Math.round((((x * 31 + y * 19) % 25) - 12) / 2), 254, 255);
    else { const value = 240 + Math.round(grain / 3); rgba.push(value, value, value, 255); }
  }
  return { id: "inline", pixels: { width: 16, height: 16, rgba }, repeat: [6, 6] };
}

/** UVs decorate existing vertices without changing the physical road by even a millimetre. */
export function ballsyRoadUvs(mesh: AgentWorldInlineMesh): AgentWorldInlineMesh {
  return { ...mesh, uvs: mesh.positions.flatMap((value, i) => i % 3 === 1 ? [] : [Math.round(value * 2500) / 10000]) };
}

/** The same sculpted, closed latex silhouette is used by native flying projectiles. */
export function ballsyBalloonMesh(radius: number): AgentWorldInlineMesh {
  const positions: number[] = [], indices: number[] = [];
  // Closed poles use tiny rings so every native triangle is non-degenerate.
  const profile = [[-.95, .07], [-.82, .13], [-.72, .07], [-.58, .48], [-.2, .9], [.25, 1], [.7, .72], [1.02, .08]];
  const segments = 20;
  for (const [y, r] of profile) for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI * 2;
    positions.push(Math.cos(a) * r * radius, y * radius, Math.sin(a) * r * radius);
  }
  for (let ring = 1; ring < profile.length; ring++) for (let i = 0; i < segments; i++) {
    const a = (ring - 1) * segments + i, b = (ring - 1) * segments + (i + 1) % segments;
    indices.push(a, a + segments, b + segments, a, b + segments, b);
  }
  for (const ring of [0, profile.length - 1]) {
    const center = positions.length / 3; positions.push(0, profile[ring][0] * radius, 0);
    for (let i = 0; i < segments; i++) {
      const a = ring * segments + i, b = ring * segments + (i + 1) % segments;
      indices.push(center, ...(ring === 0 ? [a, b] : [b, a]));
    }
  }
  return { positions, indices };
}

/** One bounded native mesh: a wet domed pool with six raised splash beads. */
export function ballsySlimeSplatMesh(): AgentWorldInlineMesh {
  const positions:number[]=[0,.12,0],indices:number[]=[];
  const segments=32;
  for(let ring=0;ring<3;ring++)for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI*2,lobe=.86+.11*Math.sin(a*7)+.045*Math.cos(a*11);
    const radius=lobe*[.52,.91,1][ring];
    positions.push(Math.cos(a)*radius,[.095,.045,.004][ring],Math.sin(a)*radius);
    if(ring===0)indices.push(0,1+(i+1)%segments,1+i);
    else {const a0=1+(ring-1)*segments+i,b0=1+(ring-1)*segments+(i+1)%segments;indices.push(a0,b0+segments,a0+segments,a0,b0,b0+segments);}
  }
  for(let bead=0;bead<6;bead++){
    const angle=bead/6*Math.PI*2+.15,r=1.07+(bead%2)*.13,x=Math.cos(angle)*r,z=Math.sin(angle)*r;
    const start=positions.length/3,wide=.055+(bead%3)*.018;
    positions.push(x,.018,z,x,.16+(bead%3)*.04,z);
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;positions.push(x+Math.cos(a)*wide,.065,z+Math.sin(a)*wide);}
    for(let i=0;i<8;i++){const a=start+2+i,b=start+2+(i+1)%8;indices.push(start,a,b,start+1,b,a);}
  }
  return {positions,indices};
}
