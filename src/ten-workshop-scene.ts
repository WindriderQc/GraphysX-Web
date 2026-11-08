import type { ExplorerPicture } from "./math-lab-explorer";
import type { AgentWorldDefinition, AgentWorldEntityDefinition, AgentWorldVector3 } from "./agent-world-runtime";
import type { MathTheme } from "./ten-workshop-theme";

export type LabShape = "box" | "sphere" | "cylinder";
export type LabPicture = { explorer?: ExplorerPicture; tokens: readonly { id: number; group: "A" | "B" }[]; practice: boolean; operation?: "complement" | "subtract"; hint: boolean; a: number; equation: string; answer: string; reference: boolean; selected: number | null; shape: LabShape };
const DIGITS: Record<string, string> = { "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgecd", "7": "abc", "8": "abcdefg", "9": "abfgcd", "+": "gv", "-": "g", "=": "ul", "?": "abgk", "C": "afed", "A": "abcefg", "B": "cdefg", "<": "efg" };
const SEGMENTS: Record<string, [number, number, number, number]> = { a: [0,-0.15,0.15,0.03], b: [0.075,-0.075,0.03,0.15], c: [0.075,0.075,0.03,0.15], d: [0,0.15,0.15,0.03], e: [-0.075,0.075,0.03,0.15], f: [-0.075,-0.075,0.03,0.15], g: [0,0,0.15,0.03], v: [0,0,0.03,0.18], u: [0,-0.05,0.15,0.03], l: [0,0.05,0.15,0.03], k: [0,0.15,0.03,0.03] };
export function composeMathLab(theme: MathTheme, picture: LabPicture): AgentWorldDefinition {
  const p = theme.palette;
  const entities: AgentWorldEntityDefinition[] = [];
  const shape = (id: string, type: AgentWorldEntityDefinition["type"], position: AgentWorldVector3, scale: AgentWorldVector3, color: string, tags: string[] = []): void => { entities.push({ id, type, label: id, transform: { position, scale }, material: { color, roughness: theme.roughness, metalness: 0 }, castShadow: true, receiveShadow: true, tags }); };
  const glyph = (id: string, text: string, x: number, y: number, z: number, size = 1, color = "#213e48") => {
    [...text].forEach((char, i) => [...(DIGITS[char] ?? "")].forEach(segment => {
      const [dx, dz, w, d] = SEGMENTS[segment];
      shape(`${id}-${i}-${segment}`, "box", [x + ((i - (text.length - 1) / 2) * 0.26 + dx) * size, y, z + dz * size], [w * size, 0.016, d * size], color);
    }));
  };
  shape("lab-island", "cylinder", [0,-0.36,0], [17,0.6,14], p.ground, ["theme:ground"]);
  shape("lab-path", "box", [0,-0.04,4.5], [2.4,0.08,5], theme.season === "winter" ? "#d2e0e7" : "#dcd0b0");
  // Same tree identity, geometry and placement in both seasons; only its dress changes.
  for (const [index,x,z,s] of [[0,-4.4,-2.2,1],[1,4.4,-3.4,0.8],[2,-5.4,2.1,0.6],[3,3,-5.2,0.7]]) {
    shape(`pine-${index}-trunk`, "cylinder", [x,0.7*s,z], [0.4*s,1.5*s,0.4*s], "#795541");
    for(let tier=0;tier<3;tier++) {
      const width=(2.5-tier*0.55)*s, y=(1.5+tier*0.75)*s;
      shape(`pine-${index}-tier-${tier}`, "cone", [x,y,z], [width,1.9*s,width], p.foliage, ["theme:foliage"]);
      shape(`pine-${index}-snow-${tier}`, "cone", [x,y+0.27*s,z], [width*0.83,1.42*s,width*0.83], "#f6fbff", ["theme:snow"]);
      entities[entities.length-1].visible=theme.season === "winter";
    }
  }
  for(let i=0;i<12;i++) {
    const angle=i*2.4, r=4.5+(i%3)*0.7;
    shape(`garden-stone-${i}`, "sphere", [Math.cos(angle)*r,0.12,Math.sin(angle)*r], [0.48,0.24,0.4], theme.season === "winter" ? "#f4f9fc" : "#c2d39c");
  }
  shape("lab-table", "box", [0,1.35,0], [6.5,0.34,4.1], p.table, ["theme:table"]);
  for(const x of [-2.7,2.7]) for(const z of [-1.55,1.55]) shape(`leg-${x}-${z}`, "cylinder", [x,0.6,z], [0.25,1.3,0.25], "#775643");
  // Stylised original child figurines, not identifiable people or downloaded assets.
  for(const [i,x,z,color,skin] of [[0,-3.9,0.1,p.primary,"#c58c63"],[1,3.9,-0.2,p.secondary,"#e6b48e"]] as const) {
    shape(`child-${i}-body`, "cylinder", [x,0.9,z], [0.65,0.85,0.6], color);
    shape(`child-${i}-head`, "sphere", [x,1.62,z], [0.64,0.67,0.64], skin);
    shape(`child-${i}-hair`, "sphere", [x,1.83,z-0.08], [0.67,0.38,0.66], i ? "#714638" : "#332f34");
    for(const dx of [-0.17,0.17]) {
      shape(`child-${i}-leg-${dx}`, "cylinder", [x+dx,0.29,z], [0.22,0.65,0.23], "#465d70");
      shape(`child-${i}-eye-${dx}`, "sphere", [x+dx*0.72,1.67,z+0.29], [0.065,0.065,0.065], "#25323a");
    }
  }
  if(picture.reference) {
    ["box","sphere","cylinder"].forEach((type,i)=>shape(`reference-${type}`,type as LabShape,[(i-1)*1.7,2,0],[0.9,0.9,0.9],i===1?p.secondary:p.primary,["theme:sample"]));
  } else if(picture.explorer) {
    const {scene,revealed,regrouped}=picture.explorer;
    if(scene) {
      const total=scene.kind==='count'?scene.to:scene.a+scene.b;
      shape("explorer-tray","box",[0,1.56,-0.15],[5.9,0.08,3.1],"#e6eee5",["math:explorer"]);
      for(let i=0;i<total;i++) {
        const group=scene.kind==='count'||i<scene.a?'A':'B';
        let x:number,z:number;
        if(scene.kind==='count'||regrouped){x=(i%10-4.5)*0.48;z=-1.42+Math.floor(i/10)*0.27;}
        else {const local=group==='A'?i:i-scene.a;x=(group==='A'?-1.5:1.5)+(local%5-2)*0.43;z=-1.05+Math.floor(local/5)*0.53;}
        shape(`explorer-unit-${i}`,picture.shape,[x,1.83,z],[0.24,0.35,0.22],group==='A'?p.primary:p.secondary,["math:explorer-unit",`math:group:${group}`]);
      }
      const text=scene.kind==='count'?String(total):`${scene.a}+${scene.b}=${revealed?total:'?'}`;
      glyph("explorer-equation",text,0,1.6,1.61,1.5);
    }
  } else {
    for(const [group,x,color] of [["A",-1.5,p.primary],["B",1.5,p.secondary]] as const) {
      shape(`lab-zone-${group}`,"box",[x,1.56,-0.35],[2.7,0.08,2.6], group === "A" ? "#d9e9ed" : "#f8e7c8",[`math:zone:${group}`]);
      glyph(`zone-label-${group}`,group,x,1.62,-1.38,1.15);
      const units = picture.practice ? Array.from({length: group === "A" ? picture.a : picture.hint ? 10-picture.a : 0},(_,id)=>({id:id+(group === "A"?0:picture.a),group})) : picture.tokens.filter(t=>t.group===group);
      units.forEach((token,i)=> {
        const x2=x+(i%5-2)*0.44,z=-0.75+Math.floor(i/5)*0.66;
        shape(`lab-token-${token.id}`,picture.shape,[x2,1.85,z],[0.33,0.4,0.33],color,["math:unit",`math:group:${group}`]);
        if(picture.practice&&picture.operation==="subtract"&&group==="A") { shape(`removed-${token.id}`,"box",[x2,2.08,z],[0.48,0.025,0.045],"#213e48",["math:removed"]); entities[entities.length-1].transform!.rotationDegrees=[0,-35,0]; }
        if(token.id===picture.selected) shape("lab-selection","torus",[x2,1.66,z],[0.5,0.1,0.5],"#ffffff");
      });
    }
    glyph("lab-equation",picture.equation,0,1.6,1.22,1.8);
    shape("calculator-base","box",[0,0.63,4],[3.6,0.5,2.7],"#314e5c");
    shape("calculator-screen","box",[0,0.91,3.15],[2.95,0.06,0.52],"#d1e5d7");
    glyph("calculator-answer",picture.answer||"?",0,0.95,3.15,1);
    const keys=["1","2","3","4","5","6","7","8","9","C","0","<"];
    keys.forEach((key,i)=>{
      const x=(i%3-1)*0.96,z=3.76+Math.floor(i/3)*0.44;
      shape(`lab-key-${key==="<"?"backspace":key}`,"box",[x,0.94,z],[0.82,0.2,0.36],key==="C"||key==="<"?"#f1c98c":"#f1f5ed",["math:key"]);
      glyph(`key-label-${i}`,key,x,1.05,z,0.66);
    });
    shape("lab-key-enter","box",[2.25,0.68,4.1],[0.8,0.6,1.3],p.primary,["math:key"]);
    glyph("key-enter-label","=",2.25,1,4.1,1.3,"#ffffff");
  }
  // Increase the calculator target size without changing table/token coordinates.
  for(const entity of entities.filter(e=>e.id?.startsWith("calculator-")||e.id?.startsWith("lab-key-")||e.id?.startsWith("key-label-")||e.id?.startsWith("key-enter-"))) {
    const t=entity.transform!;const pos=t.position!;t.position=[pos[0]*1.25,pos[1]+0.35,4+(pos[2]-4)*1.25];if(t.scale)t.scale=[t.scale[0]*1.25,t.scale[1],t.scale[2]*1.25];
  }
  entities.push({id:"lab-sun",type:"directional-light",intensity:theme.light,transform:{position:[-6,10,6]},material:{color:theme.season==="winter"?"#e7f3ff":"#fff2d5"},castShadow:true},{id:"lab-fill",type:"ambient-light",intensity:0.75,material:{color:"#ffffff"}});
  return {schema:"graphysx.agent-world/v2",id:"ten-workshop-garden",label:picture.reference?"Atelier de thèmes : scène de référence":"Les amis de 10",environment:{background:p.sky,ground:{visible:false,size:60,color:p.ground,grid:false,gridColor:p.ground},lighting:{source:"studio",intensity:0.6,yawDegrees:0,backgroundIntensity:1,backgroundBlur:0},physics:{gravity:[0,-9.81,0]}},entities};
}
