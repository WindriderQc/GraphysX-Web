import {
  BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PlaneGeometry, Raycaster, SRGBColorSpace, Vector2, Vector3, type Object3D,
} from "three";
import { PlatformHost } from "./platform-host";
import type { AgentWorldDefinition } from "./agent-world-runtime";
import { PlatformVr } from "./xr/platform-vr";
import { disposeVrObject, type VrInputAction } from "./xr/vr-input";

const WORLD: AgentWorldDefinition = {
  schema: "graphysx.agent-world/v2", id:"vr-workshop", label:"GraphysX · Atelier VR",
  environment:{background:"#071923", ground:{visible:true,size:16,color:"#102b35",grid:true,gridColor:"#214752"}},
  entities:[
    {id:"ambient",type:"ambient-light",intensity:1.8,material:{color:"#bde9ed"}},
    {id:"key",type:"directional-light",intensity:2.5,transform:{position:[-3,7,4]},material:{color:"#fff2da"}},
    {id:"vr-plinth",type:"box",geometry:{width:1.7,height:.08,depth:.7},transform:{position:[0,.82,-.85]},material:{color:"#204552",metalness:.3,roughness:.5}},
    {id:"vr-cube",type:"box",geometry:{width:.16,height:.16,depth:.16},transform:{position:[0,1.12,-.75]},material:{color:"#65edc7",metalness:.25,roughness:.28}},
    {id:"vr-ring",type:"torus",geometry:{radius:2.1,tube:.018,radialSegments:64},transform:{position:[0,.025,-1],rotationDegrees:[90,0,0]},material:{color:"#48bbba",emissive:"#1a645f",emissiveIntensity:.4}},
  ],
};

function label(text: string, width: number, height: number, color = "#e7f8f5"): Mesh<PlaneGeometry,MeshBasicMaterial> {
  const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = Math.round(1024*height/width);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.font = `600 ${Math.round(canvas.height*.42)}px sans-serif`;
  ctx.fillText(text,canvas.width/2,canvas.height/2,canvas.width-28);
  const texture = new CanvasTexture(canvas); texture.colorSpace=SRGBColorSpace;
  const result = new Mesh(new PlaneGeometry(width,height),new MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
  return result;
}

/** First consumer of the shared XR adapter. Its test object is an ordinary scene entity. */
export function mountVrLab(root: HTMLElement): { dispose(): Promise<void> } {
  const host = new PlatformHost(root,{world:WORLD,interactive:false,editorVisible:false,framing:{position:[2.3,2.25,3.4],target:[0,1.15,-1]}});
  const decor = new Group(); host.scene.add(decor);
  const textures: CanvasTexture[] = [];
  const addLabel = (text:string,x:number,y:number,z:number,width:number,height:number,color?:string) => {
    const mesh=label(text,width,height,color); mesh.position.set(x,y,z); decor.add(mesh);
    textures.push(mesh.material.map as CanvasTexture); return mesh;
  };
  addLabel("GRAPHYSX / VR",0,2.18,-2.35,2.6,.28,"#76f4d0");
  addLabel("Vos mains. Le même monde.",0,1.84,-2.35,2.3,.21);
  addLabel("Pointez · Gâchette / pincement pour agir",0,1.58,-2.35,2.2,.16);
  addLabel("Poignée / pincement pour saisir le cube",0,1.36,-2.35,2.2,.16);
  addLabel("Relâchez pour déposer · Restez sur place",0,1.14,-2.35,2.2,.16,"#a6c3cb");

  let presses=0;
  let held: {source:XRInputSource;anchor:Object3D;offset:Vector3;ray:Object3D;distance:number;near:boolean}|null=null;
  let disposed=false;
  let releaseWasCancelled=false;
  const raycaster=new Raycaster(); raycaster.far=5;
  const point=new Vector3(); const direction=new Vector3(); const ndc=new Vector2();
  const cube=host.world.getEntityObject("vr-cube")!;
  const buttons: {mesh:Mesh<BoxGeometry,MeshStandardMaterial>;run:()=>void;pressed:number}[]=[];
  let instruction="Pointez le bouton vert, puis prenez le cube.";
  const feedback=addLabel(instruction,0,.9,-2.35,2.3,.16,"#76f4d0");
  let drawnInstruction=instruction;
  const updateCube = (position:Vector3) => host.api.update("vr-cube",{transform:{position:[position.x,position.y,position.z]}});
  const reset = () => { held=null; updateCube(new Vector3(0,1.12,-.75)); instruction="Cube replacé. À vous de jouer !"; };
  const pulse = () => { presses++; host.api.update("vr-cube",{material:{color:presses%2 ? "#bda2ff" : "#65edc7"}}); instruction="Bien joué ! Saisissez le cube avec la poignée ou un pincement."; };
  const addButton=(x:number,text:string,color:string,run:()=>void) => {
    const mesh=new Mesh(new BoxGeometry(.38,.15,.06),new MeshStandardMaterial({color,roughness:.4,metalness:.2}));
    mesh.position.set(x,.98,-1.43); decor.add(mesh);
    addLabel(text,x,.98,-1.39,.33,.09);
    buttons.push({mesh,run,pressed:0});
  };
  addButton(-.48,"ESSAYER","#267f68",pulse);
  addButton(0,"REPLACER","#375775",reset);
  addButton(.48,"SORTIR VR","#654778",() => { void vr.session.exit(); });
  const aim=(ray:Object3D) => {
    if(!ray.visible)return undefined; // Hand joints may be tracked while the target ray is not.
    ray.updateWorldMatrix(true,false); ray.getWorldPosition(raycaster.ray.origin);
    direction.set(0,0,-1).transformDirection(ray.matrixWorld); raycaster.ray.direction.copy(direction);
    return raycaster.intersectObjects([...buttons.map(b=>b.mesh),cube],true)[0];
  };
  const action=(event:VrInputAction) => {
    if(event.phase==="end") {
      if(held?.source===event.source && event.action==="grab") {
        releaseWasCancelled=event.cancelled; held=null;
        instruction=event.cancelled ? "Suivi interrompu : cube relâché sans lancer." : "Cube déposé. Recommencez avec l’autre main !";
      }
      return;
    }
    const hit=aim(event.ray);
    const button=buttons.find(b=>b.mesh===hit?.object);
    if(button) { button.pressed=.22; button.run(); return; }
    if(event.action!=="grab" || held) return;
    event.anchor.getWorldPosition(point); cube.getWorldPosition(direction);
    const near=point.distanceTo(direction)<.3;
    let target:Object3D | undefined=hit?.object;
    while(target && target!==cube) target=target.parent ?? undefined;
    if(!near && target!==cube) return;
    held={source:event.source,anchor:event.anchor,offset:direction.clone().sub(point),ray:event.ray,distance:hit?.distance ?? .5,near};
    instruction="Vous tenez le cube. Relâchez pour le déposer.";
  };
  const vr=new PlatformVr(host,{onAction:action});
  const framePreview=()=> {
    if(vr.session.session)return;
    if(root.clientWidth<=600)host.camera.position.set(0,2.1,4.9);
    else host.camera.position.set(2.3,2.25,3.4);
    host.orbitTarget.set(0,1.15,-1);
    host.camera.lookAt(host.orbitTarget);
  };
  window.addEventListener("resize",framePreview);framePreview();
  const style=document.createElement("style");
  style.textContent=`
    .gx-vr-ui{position:absolute;inset:0;pointer-events:none;color:#e9f5f4;font-family:var(--gx-font,sans-serif)}
    .gx-vr-ui *{box-sizing:border-box}.gx-vr-top{position:absolute;top:24px;left:28px;right:28px;display:flex;align-items:center;justify-content:space-between;gap:16px}
    .gx-vr-top strong{font-size:16px;letter-spacing:.13em}.gx-vr-top a{color:#b5d5df;pointer-events:auto;font-size:14px;text-decoration:none;padding:12px;border:1px solid #36606e;border-radius:24px}
    .gx-vr-panel{position:absolute;left:28px;bottom:28px;width:min(430px,calc(100% - 56px));padding:22px;background:#092430ed;border:1px solid #315760;border-radius:20px;box-shadow:0 18px 60px #00161b66;pointer-events:auto}
    .gx-vr-panel h1{font-size:26px;margin:0 0 8px;line-height:1.15}.gx-vr-panel p{font-size:13px;line-height:1.55;color:#b9d6dc;margin:8px 0}
    .gx-vr-panel .gx-vr-status{color:#76f4d0;min-height:40px}.gx-vr-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    .gx-vr-actions button{font:600 13px var(--gx-font,sans-serif);padding:12px 16px;min-height:44px;border-radius:12px;border:1px solid #467181;background:#204654;color:#f0fffb;cursor:pointer}
    .gx-vr-actions .gx-vr-enter{background:#75ebc9;color:#092d28;border-color:#75ebc9}.gx-vr-actions button:disabled{opacity:.5;cursor:default}
    .gx-vr-detail{font-size:11px!important;color:#9ab6bf!important}.gx-vr-live{font-size:12px;color:#bfaaff;margin-top:12px}
    @media(max-width:600px){.gx-vr-top{top:14px;left:16px;right:16px}.gx-vr-panel{left:16px;bottom:16px;width:calc(100% - 32px);padding:16px}.gx-vr-panel h1{font-size:21px}.gx-vr-detail{display:none}}
  `;
  const ui=document.createElement("section");ui.className="gx-vr-ui";ui.lang="fr";
  ui.innerHTML=`<div class="gx-vr-top"><strong>GRAPHYSX / LAB VR</strong><a href="${import.meta.env.BASE_URL}">Retour à GraphysX</a></div>
    <div class="gx-vr-panel"><h1>Entrez dans votre monde.</h1><p>Un premier atelier pour voir vos mains, essayer les boutons et déplacer un objet. Sans déplacement automatique.</p>
    <p class="gx-vr-status" role="status"></p><div class="gx-vr-actions"><button class="gx-vr-enter" disabled>Vérification VR…</button><button class="gx-vr-preview">Essayer le bouton</button><button class="gx-vr-reset">Replacer le cube</button></div>
    <div class="gx-vr-live" aria-live="polite"></div><p class="gx-vr-detail">Mains : articulations suivies si le casque les fournit. Manettes : modèle générique et boutons animés, pas de doigts suivis autour de la poignée. Quittez aussi avec le menu du casque.</p></div>`;
  root.append(style,ui);
  const enter=ui.querySelector<HTMLButtonElement>(".gx-vr-enter")!;
  const status=ui.querySelector<HTMLElement>(".gx-vr-status")!;
  const live=ui.querySelector<HTMLElement>(".gx-vr-live")!;
  const unsubscribeState=vr.session.subscribe(({phase})=> {
    enter.disabled=phase==="checking" || phase==="unsupported" || phase==="stopping" || phase==="disposed";
    enter.textContent=phase==="starting" ? "Annuler" : vr.session.session ? "Quitter la VR" : "Entrer en VR";
    status.textContent=phase==="unsupported" ? (window.isSecureContext ? "Aucun casque WebXR disponible ici. L’aperçu 3D reste utilisable." : "La VR nécessite HTTPS ou localhost. Aucun réglage de sécurité à désactiver.")
      : phase==="ready" ? "Prêt. Dégagez votre espace puis entrez en VR."
      : phase==="active" ? "Dans le casque : pointez, pressez, saisissez."
      : phase==="error" ? (vr.session.session ? "La sortie n’a pas abouti. Réessayez ou utilisez le menu du casque." : "La VR n’a pas démarré. Vérifiez l’accès au casque puis réessayez.")
      : phase==="starting" ? "Ouverture dans le casque…" : phase==="stopping" ? "Retour à l’écran…" : "Vérification du navigateur…";
  });
  enter.addEventListener("click",()=> { if(vr.session.session || vr.session.snapshot.phase==="starting") void vr.session.exit(); else void vr.session.enter(); });
  ui.querySelector(".gx-vr-preview")!.addEventListener("click",pulse);
  ui.querySelector(".gx-vr-reset")!.addEventListener("click",reset);
  const pointer=(event:PointerEvent)=> {
    if(vr.session.session) return;
    const rect=host.renderer.domElement.getBoundingClientRect();
    ndc.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(ndc,host.camera);
    const hit=raycaster.intersectObjects(buttons.map(b=>b.mesh))[0];
    const button=buttons.find(b=>b.mesh===hit?.object); if(button){button.pressed=.22;button.run();}
  };
  host.renderer.domElement.addEventListener("pointerdown",pointer);
  const unsubscribeFrame=host.subscribeFrame(delta=> {
    if(drawnInstruction!==instruction){
      const canvas=feedback.material.map!.image as HTMLCanvasElement;
      const ctx=canvas.getContext("2d")!;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillText(instruction,canvas.width/2,canvas.height/2,canvas.width-28);
      feedback.material.map!.needsUpdate=true;drawnInstruction=instruction;
    }
    if(held && !held.near && !held.ray.visible){
      held=null;releaseWasCancelled=true;instruction="Rayon perdu : cube relâché sans lancer.";
    }
    if(held) {
      if(held.near) held.anchor.getWorldPosition(point).add(held.offset);
      else { aim(held.ray); raycaster.ray.at(held.distance,point); }
      point.y=Math.max(.15,Math.min(3,point.y)); point.x=Math.max(-3,Math.min(3,point.x)); point.z=Math.max(-3,Math.min(2,point.z));
      updateCube(point);
    }
    for(const button of buttons){button.pressed=Math.max(0,button.pressed-delta);button.mesh.position.z=-1.43-(button.pressed>0 ? .018:0);}
    const sources=vr.input.slots.filter(s=>s.source).map(s=>`${s.source!.handedness === "left" ? "G" : s.source!.handedness === "right" ? "D" : "?"} : ${s.source!.hand ? "main" : "manette"}`).join(" · ");
    const text=`${instruction}${sources ? ` / ${sources}` : ""}`;if(live.textContent!==text)live.textContent=text;
  });
  const diagnostics={host,vr,get presses(){return presses;},get holding(){return !!held;},get cancelled(){return releaseWasCancelled;}};
  Object.assign(window,{__GRAPHYSX__:host.api,__GRAPHYSX_VR__:diagnostics});
  async function dispose():Promise<void>{
    if(disposed)return;
    await vr.dispose(); if(vr.session.session)return;
    disposed=true;unsubscribeFrame();unsubscribeState();
    const globals=window as unknown as {__GRAPHYSX__?:unknown;__GRAPHYSX_VR__?:unknown};
    if(globals.__GRAPHYSX__===host.api)delete globals.__GRAPHYSX__;
    if(globals.__GRAPHYSX_VR__===diagnostics)delete globals.__GRAPHYSX_VR__;
    host.renderer.domElement.removeEventListener("pointerdown",pointer);
    window.removeEventListener("resize",framePreview);
    for(const texture of textures)texture.dispose();disposeVrObject(decor);host.dispose();style.remove();ui.remove();
    window.removeEventListener("pagehide",pageHide);
  }
  const pageHide=()=>{void dispose();};window.addEventListener("pagehide",pageHide);
  return {dispose};
}
