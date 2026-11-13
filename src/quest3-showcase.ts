import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, SRGBColorSpace, Vector3 } from "three";
import { PlatformHost } from "./platform-host";
import { PlatformVr } from "./xr/platform-vr";
import { QUEST_PROFILES, type QuestProfile } from "./xr/quest-profile";
import { disposeVrObject, type VrInputAction } from "./xr/vr-input";
import { createQuest3Scene } from "./quest3-scene";
import "./quest3-showcase.css";

const VIEWS = [
  { label: "Arrivée", position: [4.2,2.9,2.5], target: [0,2,-12], floor: [0,0,1], yaw: 0 },
  { label: "Réacteur", position: [4.2,2.1,-5.5], target: [0,2.6,-11], floor: [3.5,0,-6], yaw: .5 },
  { label: "Belvédère", position: [0,1.8,-19.5], target: [0,8,-58], floor: [0,.14,-21], yaw: 0 },
] as const;

function panel(text: string, width: number, height: number) {
  const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=Math.round(1024*height/width);
  const ctx=canvas.getContext("2d")!;ctx.fillStyle="#07151e";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#a4e5df";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=`500 ${Math.round(canvas.height*.35)}px sans-serif`;ctx.fillText(text,512,canvas.height/2,980);
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
  return new Mesh(new PlaneGeometry(width,height),new MeshBasicMaterial({map:texture}));
}

export function mountQuest3Showcase(root: HTMLElement): { dispose(): Promise<void> } {
  const host=new PlatformHost(root,{world:createQuest3Scene(),interactive:false,editorVisible:false,framing:{position:[...VIEWS[0].position],target:[...VIEWS[0].target]}});
  host.renderer.shadowMap.enabled=false;
  const profileValue=new URLSearchParams(location.search).get("quality");
  const profile: QuestProfile=profileValue && Object.hasOwn(QUEST_PROFILES,profileValue) ? profileValue as QuestProfile : "balanced";
  const decor=new Group();host.scene.add(decor);
  const consoleGroup=new Group();consoleGroup.position.fromArray(VIEWS[0].floor);decor.add(consoleGroup);
  const title=panel("N A C R E   /   ORBITAL OBSERVATORY",4.2,.28);title.position.set(0,4.9,-23.6);decor.add(title);
  const worldButtons=[{label:"RÉACTEUR",run:()=>view(1)},{label:"BELVÉDÈRE",run:()=>view(2)},{label:"ÉNERGIE",run:()=>togglePower()},{label:"SORTIR VR",run:()=>{void vr.session.exit();}}].map((item,i)=>{
    const mesh=panel(item.label,.42,.12);mesh.position.set(-.72+i*.48,1.16,-2.02);mesh.rotation.x=-.18;consoleGroup.add(mesh);return {...item,mesh};
  });
  const metric=panel("NACRE / PRÊT",1.8,.2);metric.position.set(0,1.65,-2.2);consoleGroup.add(metric);
  const raycaster=new Raycaster();raycaster.far=6;const direction=new Vector3();
  let power=true,disposed=false,elapsed=0;
  function togglePower() {
    power=!power;
    host.api.transaction(Array.from({length:4},(_,i)=>({op:"update" as const,id:`nacre-reactor-ring-${i}`,patch:{material:{emissiveIntensity:power?1.3:.12}}})).concat([
      {op:"update" as const,id:"nacre-reactor-core",patch:{material:{emissiveIntensity:power?1.8:.08}}},
    ]));
  }
  const action=(event:VrInputAction)=>{
    if(event.phase!=="start" || !event.ray.visible)return;
    event.ray.updateWorldMatrix(true,false);event.ray.getWorldPosition(raycaster.ray.origin);
    raycaster.ray.direction.copy(direction.set(0,0,-1).transformDirection(event.ray.matrixWorld));
    const hit=raycaster.intersectObjects(worldButtons.map(button=>button.mesh))[0];worldButtons.find(button=>button.mesh===hit?.object)?.run();
  };
  const vrOptions={profile,onAction:action,position:[...VIEWS[0].floor] as [number,number,number]};
  const vr=new PlatformVr(host,vrOptions);
  const previewFov=host.camera.fov;
  const resizePreview=()=>{if(vr.session.session)return;host.camera.fov=root.clientWidth<650?75:previewFov;host.camera.updateProjectionMatrix();};
  window.addEventListener("resize",resizePreview);resizePreview();
  function view(index:number) {
    const target=VIEWS[index]!;
    if(vr.session.session){vr.floorPosition.fromArray(target.floor);vr.rig.position.copy(vr.floorPosition);if(vr.referenceSpace==="local")vr.rig.position.y+=1.6;vr.rig.rotation.y=target.yaw;consoleGroup.position.copy(vr.floorPosition);consoleGroup.rotation.y=target.yaw;}
    else host.frameView([...target.position],[...target.target],0);
    for(const [i,button] of [...ui.querySelectorAll<HTMLButtonElement>("[data-view]")].entries())button.setAttribute("aria-pressed",String(i===index));
  }
  const ui=document.createElement("section");ui.className="nacre-ui";ui.lang="fr";
  ui.innerHTML=`<header class="nacre-top"><div class="nacre-brand"><span class="nacre-mark">N</span> GRAPHYSX <span>/</span> EXPÉDITION 001</div><a href="${import.meta.env.BASE_URL}">Retour aux mondes ↗</a></header>
    <div class="nacre-status"><div role="status" class="nacre-loading">Préparation de la station…</div><div class="nacre-stats" hidden></div><div class="nacre-tools"><button class="nacre-diagnostic" aria-expanded="false">Diagnostic</button><button class="nacre-power" aria-pressed="true">Réacteur actif</button><button class="nacre-save">Sauvegarder</button></div></div>
    <div class="nacre-caption"><div class="nacre-rule"></div><span class="nacre-eyebrow">OBSERVATOIRE ORBITAL / SECTEUR 07</span><h1>Au-delà<br>du silence.</h1><p>Une station suspendue entre deux mondes.<br>Approchez le cœur. Regardez plus loin.</p></div>
    <footer class="nacre-bottom"><nav class="nacre-nav" aria-label="Points d’observation">${VIEWS.map((v,i)=>`<button data-view="${i}" aria-pressed="${i===0}">${String(i+1).padStart(2,"0")} · ${v.label}</button>`).join("")}</nav><div class="nacre-actions"><select aria-label="Qualité VR"><option value="balanced">VR · Équilibrée</option><option value="quality">VR · Qualité</option><option value="economy">VR · Économie</option></select><button class="nacre-enter" disabled>Vérification VR…</button></div></footer>`;
  root.append(ui);const status=ui.querySelector<HTMLElement>("[role=status]")!,stats=ui.querySelector<HTMLElement>(".nacre-stats")!,enter=ui.querySelector<HTMLButtonElement>(".nacre-enter")!,quality=ui.querySelector<HTMLSelectElement>("select")!;
  quality.value=profile;
  quality.addEventListener("change",()=>{if(!Object.hasOwn(QUEST_PROFILES,quality.value))return;vrOptions.profile=quality.value as QuestProfile;const next=new URL(location.href);next.searchParams.set("quality",quality.value);history.replaceState(null,"",next);});
  ui.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(button=>button.addEventListener("click",()=>view(Number(button.dataset.view))));
  ui.querySelector(".nacre-diagnostic")!.addEventListener("click",event=>{stats.hidden=!stats.hidden;(event.currentTarget as HTMLElement).setAttribute("aria-expanded",String(!stats.hidden));});
  ui.querySelector<HTMLButtonElement>(".nacre-power")!.addEventListener("click",event=>{togglePower();const button=event.currentTarget as HTMLButtonElement;button.textContent=power?"Réacteur actif":"Réacteur en veille";button.setAttribute("aria-pressed",String(power));});
  const savedName="NACRE · Ma station";
  let notice="",noticeUntil=0;
  const announce=(message:string)=>{notice=message;noticeUntil=performance.now()+3000;status.textContent=message;};
  const resume=document.createElement("button");resume.className="nacre-load";resume.textContent="Reprendre";resume.disabled=!host.api.state()?.savedWorlds.includes(savedName);ui.querySelector(".nacre-tools")!.append(resume);
  resume.addEventListener("click",()=>{const result=host.api.load(savedName);announce(result.ok?"Votre station est reprise.":"La reprise n’a pas abouti.");});
  ui.querySelector(".nacre-save")!.addEventListener("click",()=>{const result=host.api.save(savedName);resume.disabled=!result.ok;announce(result.ok?"Station sauvegardée dans ce navigateur.":"La sauvegarde n’a pas abouti.");});
  enter.addEventListener("click",()=>{if(vr.session.session || vr.session.snapshot.phase==="starting")void vr.session.exit();else void vr.session.enter();});
  const sessionOff=vr.session.subscribe(({phase})=>{
    enter.disabled=["checking","unsupported","stopping","disposed"].includes(phase);
    enter.textContent=phase==="starting"?"Annuler":vr.session.session?"Quitter la VR":"Entrer en VR";
    ui.dataset.immersive=String(phase==="active");quality.disabled=phase==="active"||phase==="starting";
    consoleGroup.visible=phase==="active";
    if(phase==="ready")resizePreview();
  });
  const modelStates=()=> (host.api.state()?.entities ?? []).filter(entity=>entity.asset);
  let assets=modelStates();
  const assetOff=host.world.subscribeEvents(event=>{
    if(["asset.ready","asset.error","world.loaded","entity.spawned","entity.removed"].includes(event.type))assets=modelStates();
    if(event.type==="world.loaded" || event.type==="entity.updated"){
      const core=host.api.query({ids:["nacre-reactor-core"]})[0];power=(core?.material.emissiveIntensity ?? 0)>.5;
      const button=ui.querySelector<HTMLButtonElement>(".nacre-power")!;button.textContent=power?"Réacteur actif":"Réacteur en veille";button.setAttribute("aria-pressed",String(power));button.disabled=!core;
    }
  });
  const frameOff=host.subscribeFrame(delta=>{
    elapsed+=delta;if(elapsed<.5)return;elapsed=0;
    const diagnostic=host.diagnostics.snapshot();
    const failed=assets.filter(entity=>entity.asset?.status==="error");const loading=assets.filter(entity=>entity.asset?.status==="loading");
    status.dataset.error=String(failed.length>0);
    const message=failed.length?`Chargement incomplet : ${failed[0]!.asset?.error}`:loading.length?`Préparation de la station · ${assets.length-loading.length}/${assets.length}`:performance.now()<noticeUntil?notice:vr.session.snapshot.phase==="error"?vr.session.snapshot.message:vr.session.snapshot.phase==="unsupported"?"Aperçu 3D · Ouvrez cette page dans le Quest pour la VR.":`Station prête · Profil ${quality.selectedOptions[0]!.textContent}`;
    if(status.textContent!==message)status.textContent=message;
    status.classList.toggle("nacre-loading",loading.length>0);
    stats.textContent=`${diagnostic.scope} · ${diagnostic.observedHz??"—"} Hz observés\nTrame p95 ${diagnostic.intervalMs.p95??"—"} ms · CPU p95 ${diagnostic.cpuSubmissionMs.p95??"—"} ms\n${diagnostic.calls} appels · ${diagnostic.triangles.toLocaleString("fr-CA")} triangles\n${diagnostic.textures} textures · GPU non mesuré`;
    const canvas=metric.material.map!.image as HTMLCanvasElement,ctx=canvas.getContext("2d")!;ctx.fillStyle="#07151e";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#a4e5df";ctx.fillText(`NACRE / ${diagnostic.observedHz??"—"} Hz · p95 ${diagnostic.intervalMs.p95??"—"} ms`,512,canvas.height/2,980);metric.material.map!.needsUpdate=true;
  });
  Object.assign(window,{__GRAPHYSX__:host.api,__GRAPHYSX_QUEST3__:{host,vr,view,togglePower,profile}});
  return {async dispose(){if(disposed)return;await vr.dispose();if(vr.session.session)return;disposed=true;window.removeEventListener("resize",resizePreview);frameOff();sessionOff();assetOff();disposeVrObject(decor);decor.removeFromParent();ui.remove();host.dispose();}};
}
