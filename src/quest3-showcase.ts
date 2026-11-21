import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Raycaster, SRGBColorSpace, Vector2, Vector3, type Intersection, type Object3D } from "three";
import { PlatformHost } from "./platform-host";
import { PlatformVr } from "./xr/platform-vr";
import { QUEST_PROFILES, type QuestProfile } from "./xr/quest-profile";
import { disposeVrObject, type VrInputAction } from "./xr/vr-input";
import { createQuest3Scene } from "./quest3-scene";
import { NACRE, NacreMission } from "./nacre-mission";
import { LOCAL_SCENE_PREFIX, readLocalSceneSlot } from "./local-scenes";
import "./quest3-showcase.css";

const SAVED_STATION = "NACRE · Ma station";
const OPTIONAL_MODELS = new Set(["nacre-clouds", "nacre-ribs", "nacre-inlays", "nacre-equipment", "nacre-stars"]);
const READY_TIMEOUT_MS = 30_000;

const VIEWS = [
  { label: "Cellule", position: [.9,1.65,1.6], target: [.6,1.25,-.7], floor: [0,0,1], yaw: 0 },
  { label: "Réacteur", position: [1,1.35,-5.8], target: [.2,2.35,-10.7], floor: [1,0,-7.3], yaw: 0 },
  { label: "Belvédère", position: [0,1.8,-22.5], target: [1,8,-58], floor: [0,.14,-22.5], yaw: 0 },
] as const;
const HELP = {
  standby: "Une cellule. Un réacteur. La Terre au bout du couloir.",
  cell: "Saisissez la cellule sur son support.",
  carrying: "Portez la cellule au socle du réacteur.",
  docked: "Cellule verrouillée. Lancez le réacteur.",
  charging: "Champ magnétique en formation…",
  opening: "Réacteur stable. Ouverture du belvédère…",
  ready: "Le belvédère est ouvert. Approchez.",
  complete: "Signal rétabli. Bienvenue au belvédère.",
};

function panel(text: string, width: number, height: number) {
  const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=Math.round(1024*height/width);
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
  const mesh=new Mesh(new PlaneGeometry(width,height),new MeshBasicMaterial({map:texture}));
  drawPanel(mesh,text);return mesh;
}
function drawPanel(mesh: Mesh<PlaneGeometry,MeshBasicMaterial>, text: string) {
  const canvas=mesh.material.map!.image as HTMLCanvasElement,ctx=canvas.getContext("2d")!;
  ctx.fillStyle="#07151e";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#a4e5df";
  ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="500 "+Math.round(canvas.height*.3)+"px sans-serif";
  const lines=text.split("\n");lines.forEach((line,i)=>ctx.fillText(line,512,canvas.height*(i+.5)/lines.length,980));mesh.material.map!.needsUpdate=true;
}
function visibleInScene(object: Object3D): boolean {
  for (let ancestor: Object3D | null = object; ancestor; ancestor = ancestor.parent) {
    if (!ancestor.visible) return false;
  }
  return true;
}
function hitMaterial(hit: Intersection) {
  const mesh = hit.object as Mesh;
  if (!mesh.isMesh) return undefined;
  return Array.isArray(mesh.material) ? mesh.material[hit.face?.materialIndex ?? 0] : mesh.material;
}
type Held = { source: XRInputSource; key: string; anchor: Object3D; offset: Vector3; rotation: Quaternion };

export function mountQuest3Showcase(root: HTMLElement): {dispose(): Promise<void>} {
  const host=new PlatformHost(root,{world:createQuest3Scene(),interactive:false,editorVisible:false,
    framing:{position:[4.2,2.9,2.5],target:[0,2,-12]}});
  host.renderer.shadowMap.enabled=false;
  const mission=new NacreMission(host.world,host.api);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const value=new URLSearchParams(location.search).get("quality");
  const profile: QuestProfile=value&&Object.hasOwn(QUEST_PROFILES,value)?value as QuestProfile:"balanced";
  let disposed=false,viewIndex=0,previewView=0,held:Held|null=null,lastCancelled=false,visualReady=false,warming=false,loadVersion=0;
  let loadError: "render" | "context" | "timeout" | null = null;
  let loadStarted = performance.now();
  let readyOff:(()=>void)|null=null,sessionVisibilityOff:(()=>void)|null=null,lastSession:XRSession|null=null;
  const decor=new Group();host.scene.add(decor);
  const consoleGroup=new Group();consoleGroup.position.fromArray(VIEWS[0].floor);decor.add(consoleGroup);
  const title=panel("N A C R E  /  RÉTABLIR LE SIGNAL",4.2,.28);title.position.set(0,4.9,-20.9);decor.add(title);
  const metric=panel("PRÉPARATION DE LA STATION",2.1,.32);metric.position.set(0,1.75,-1.85);consoleGroup.add(metric);
  const raycaster=new Raycaster();raycaster.far=6;
  const point=new Vector3(),direction=new Vector3(),rotation=new Quaternion(),scratch=new Vector3(),ndc=new Vector2();
  const ui=document.createElement("section");ui.className="nacre-ui";ui.lang="fr";
  ui.innerHTML='<header class="nacre-top"><div class="nacre-brand"><span class="nacre-mark">N</span> GRAPHYSX <span>/</span> EXPÉDITION 001</div><a href="'+import.meta.env.BASE_URL+'">Retour aux mondes ↗</a></header>'
    +'<div class="nacre-status"><div role="status" class="nacre-loading">Préparation de la station…</div><button class="nacre-retry" hidden>Réessayer le chargement</button><div class="nacre-stats" hidden></div><details class="nacre-menu" open><summary>Options</summary><div class="nacre-tools"><button class="nacre-audio" aria-pressed="false">Son activé</button><button class="nacre-save">Sauvegarder</button><button class="nacre-load" disabled>Reprendre</button><button class="nacre-reset">Rejouer</button><button class="nacre-diagnostic" aria-expanded="false">Diagnostic</button></div></details></div>'
    +'<div class="nacre-caption"><div class="nacre-rule"></div><span class="nacre-eyebrow">NACRE / RÉTABLIR LE SIGNAL</span><h1>Ramenez<br>la lumière.</h1><p class="nacre-objective">Une cellule. Un réacteur. La Terre au bout du couloir.</p><ol class="nacre-steps" aria-label="Progression"><li>Cellule</li><li>Réacteur</li><li>Belvédère</li></ol><progress class="nacre-charge" max="1" value="0" hidden></progress><button class="nacre-primary" disabled>Préparation…</button><p class="nacre-help">PC : E / Espace pour agir · clic sur la cellule ou le socle.<br>Quest : poignée pour saisir, gâchette pour les commandes.</p></div>'
    +'<footer class="nacre-bottom"><nav class="nacre-nav" aria-label="Points d’observation">'+VIEWS.map((v,i)=>'<button data-view="'+i+'" aria-pressed="'+String(i===0)+'">'+String(i+1).padStart(2,"0")+" · "+v.label+"</button>").join("")+'</nav><div class="nacre-actions"><select aria-label="Qualité VR"><option value="balanced">VR · Équilibrée</option><option value="quality">VR · Qualité</option><option value="economy">VR · Économie</option></select><button class="nacre-enter" disabled>Vérification VR…</button></div></footer>';
  root.append(ui);
  const status=ui.querySelector<HTMLElement>("[role=status]")!,stats=ui.querySelector<HTMLElement>(".nacre-stats")!;
  const primary=ui.querySelector<HTMLButtonElement>(".nacre-primary")!,enter=ui.querySelector<HTMLButtonElement>(".nacre-enter")!,quality=ui.querySelector<HTMLSelectElement>("select")!;
  const objective=ui.querySelector<HTMLElement>(".nacre-objective")!,headline=ui.querySelector<HTMLElement>("h1")!,charge=ui.querySelector<HTMLProgressElement>("progress")!;
  const soundButton=ui.querySelector<HTMLButtonElement>(".nacre-audio")!,resume=ui.querySelector<HTMLButtonElement>(".nacre-load")!;
  const retry=ui.querySelector<HTMLButtonElement>(".nacre-retry")!;
  const menu=ui.querySelector<HTMLDetailsElement>(".nacre-menu")!;
  const previewFov=host.camera.fov;let compactUi:boolean|undefined;
  function savedStation() {
    try { return readLocalSceneSlot(SAVED_STATION); }
    catch { return null; }
  }
  const refreshResume = () => { resume.disabled = !savedStation(); };
  const storageChanged = (event: StorageEvent) => {
    if (event.key === null || event.key === LOCAL_SCENE_PREFIX + SAVED_STATION) refreshResume();
  };
  refreshResume();
  window.addEventListener("storage", storageChanged);
  quality.value=profile;
  let notice="",noticeUntil=0,drawnPanel="",uiClock=0,manualTime=false,manualRemainder=0,lastMissionNotice="",movingView=false,buttonLabel="";
  let models=host.api.query({type:"model"});
  const announce=(text:string)=>{notice=text;noticeUntil=performance.now()+2500;};
  const under=(object:Object3D|undefined,id:string)=>{const target=host.world.getEntityObject(id);while(object){if(object===target)return true;object=object.parent??undefined;}return false;};
  const pickTargets=()=>{
    const ids=[NACRE.socket,"nacre-control"];if(mission.phase==="cell")ids.push(NACRE.cell);
    return ids.map(id=>host.world.getEntityObject(id)).filter((o):o is Object3D=>!!o);
  };
  function blockedBefore(distance: number, ignoreCell = mission.holding): boolean {
    raycaster.far = Math.max(0, distance - .0001);
    return raycaster.intersectObject(host.world.group, true).some(hit => {
      if (!visibleInScene(hit.object) || (ignoreCell && under(hit.object, NACRE.cell))) return false;
      const material = hitMaterial(hit);
      return !!material?.visible && !material.transparent && !("wireframe" in material && material.wireframe);
    });
  }
  function pick(includeConsole: boolean) {
    const targets = pickTargets();
    if (includeConsole) targets.push(...buttons.map(button => button.mesh));
    const hit = raycaster.intersectObjects(targets, true)
      .find(item => visibleInScene(item.object) && hitMaterial(item)?.visible !== false);
    return hit && !blockedBefore(hit.distance) ? hit : undefined;
  }
  const aim=(ray:Object3D)=>{
    if(!ray.visible)return undefined;
    raycaster.far=6;
    ray.updateWorldMatrix(true,false);ray.getWorldPosition(raycaster.ray.origin);direction.set(0,0,-1).transformDirection(ray.matrixWorld);raycaster.ray.direction.copy(direction);
    return pick(true);
  };
  function buzz(source:XRInputSource,value=.25) {
    const actuator=source.gamepad?.hapticActuators?.[0] as {pulse?:(value:number,duration:number)=>Promise<boolean>}|undefined;
    void actuator?.pulse?.(value,35).catch(()=>false);
  }
  function action(event:VrInputAction) {
    if(event.phase==="end") {
      if(event.action==="grab"&&held?.source===event.source){lastCancelled=event.cancelled;mission.release(held.key,event.cancelled);held=null;}
      return;
    }
    const hit=aim(event.ray);
    if (!visualReady) {
      if (event.action === "select" && hit?.object === buttons.at(-1)?.mesh) void vr.session.exit();
      return;
    }
    if(event.action==="grab"&&mission.phase==="cell"&&!held) {
      event.anchor.updateWorldMatrix(true,false);event.anchor.getWorldPosition(point);
      const cell=host.world.getEntityObject(NACRE.cell)!;cell.getWorldPosition(scratch);
      const distance = point.distanceTo(scratch);
      let near = distance < .36;
      if (near && distance > 0) {
        raycaster.ray.set(point, direction.subVectors(scratch, point).normalize());
        near = !blockedBefore(distance, true);
      }
      if(near||under(hit?.object,NACRE.cell)) {
        const key="xr:"+vr.input.slots.findIndex(slot=>slot.source===event.source);
        if(mission.take(key)){
          event.anchor.getWorldQuaternion(rotation);
          const inverse=rotation.clone().invert();
          held={source:event.source,key,anchor:event.anchor,offset:near?scratch.clone().sub(point).applyQuaternion(inverse):new Vector3(0,0,-.1),rotation:inverse.multiply(cell.getWorldQuaternion(new Quaternion()))};
          lastCancelled=false;buzz(event.source);
        }
        return;
      }
    }
    if(event.action!=="select"&&!event.source.hand)return;
    const button=buttons.find(b=>b.mesh===hit?.object);
    if(button){button.run();buzz(event.source);return;}
    if(under(hit?.object,"nacre-control")){mission.activate();buzz(event.source);}
  }
  const vrOptions={profile,onAction:action,position:[...VIEWS[0].floor] as [number,number,number]};
  const vr=new PlatformVr(host,vrOptions);
  const buttons=[
    {label:"CELLULE",run:()=>{if(mission.phase==="complete")mission.reset();view(0);}},{label:"RÉACTEUR",run:()=>view(1)},
    {label:"ALLUMER",run:()=>mission.activate()},{label:"BELVÉDÈRE",run:()=>view(2)},
    {label:"SON",run:()=>mission.toggleMute()},{label:"SORTIR VR",run:()=>{void vr.session.exit();}},
  ].map((item,i)=>{const mesh=panel(item.label,.36,.12);mesh.name="nacre-ui:"+item.label;mesh.position.set(-1+i*.4,1.18,-1.72);mesh.rotation.x=-.18;consoleGroup.add(mesh);return {...item,mesh};});

  function view(index:number) {
    if(index===2&&mission.phase&&!["ready","complete"].includes(mission.phase)){announce("Le belvédère attend l’énergie du réacteur.");return;}
    const target=VIEWS[index];viewIndex=index;
    if(vr.session.session){
      vr.floorPosition.fromArray(target.floor);vr.rig.position.copy(vr.floorPosition);
      if(vr.referenceSpace==="local")vr.rig.position.y+=1.6;
      vr.rig.rotation.y=target.yaw;consoleGroup.position.copy(vr.floorPosition);consoleGroup.rotation.y=target.yaw;
      movingView=false;
    } else {
      previewView=index;resizePreview();
      movingView = !reducedMotion.matches;
      host.frameView([...target.position], [...target.target], movingView ? .3 : 0);
    }
    ui.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button,i)=>button.setAttribute("aria-pressed",String(i===index)));
    if(index===2){(vr.session.session?vr.camera:host.camera).getWorldPosition(point);mission.complete(point);}
  }
  function moveHeld() {
    if(held){
      if(!vr.session.session||vr.session.snapshot.phase!=="active"||!held.anchor.visible){mission.release(held.key,true);held=null;lastCancelled=true;return;}
      held.anchor.updateWorldMatrix(true,false);held.anchor.getWorldPosition(point);held.anchor.getWorldQuaternion(rotation);
      point.add(scratch.copy(held.offset).applyQuaternion(rotation));rotation.multiply(held.rotation);mission.move(held.key,point,rotation);
    }else if(mission.holding){
      host.camera.updateWorldMatrix(true,false);host.camera.localToWorld(point.set(-.2,-.22,-1.15));host.camera.getWorldQuaternion(rotation);mission.move("desktop",point,rotation);
    }
  }
  function primaryAction() {
    if(!visualReady)return;
    if (mission.needsRetry) { mission.activate(); return; }
    const phase=mission.phase;
    if(!phase){host.api.create(createQuest3Scene());view(0);}
    else if(phase==="standby"){mission.begin();view(0);}
    else if(phase==="cell"){mission.take("desktop");moveHeld();}
    else if(phase==="carrying"){
      if(viewIndex!==1||movingView||host.camera.position.distanceTo(scratch.fromArray(VIEWS[1].position))>.05)view(1);
      else{mission.move("desktop",point.fromArray(NACRE.dock),rotation.identity());mission.release("desktop");}
    }
    else if(phase==="docked")mission.activate();
    else if(phase==="ready")view(2);
    else if(phase==="complete"){mission.reset();view(0);}
  }
  primary.addEventListener("click",primaryAction);
  ui.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(b=>b.addEventListener("click",()=>view(Number(b.dataset.view))));
  soundButton.addEventListener("click",()=>mission.toggleMute());
  menu.addEventListener("click",event=>{if(root.clientWidth<650&&(event.target as HTMLElement).closest("button"))menu.open=false;});
  ui.querySelector(".nacre-reset")!.addEventListener("click",()=>{held=null;if(mission.phase)mission.reset();else host.api.create(createQuest3Scene());view(0);});
  ui.querySelector(".nacre-diagnostic")!.addEventListener("click",event=>{stats.hidden=!stats.hidden;(event.currentTarget as HTMLElement).setAttribute("aria-expanded",String(!stats.hidden));});
  ui.querySelector(".nacre-save")!.addEventListener("click",()=>{
    mission.commitHeldPose();
    const result=host.api.save(SAVED_STATION);
    refreshResume();
    announce(result.ok?"Station sauvegardée dans ce navigateur.":"La sauvegarde n’a pas abouti.");
  });
  resume.addEventListener("click",()=>{
    const slot=savedStation();
    const result=slot && host.api.load(slot.definition);
    refreshResume();
    const resumed=result?.ok ?? false;
    if (resumed) view(mission.phase === "complete" ? 2 : 0);
    announce(resumed?"Votre station est reprise.":"La reprise n’a pas abouti.");
  });
  quality.addEventListener("change",()=>{if(!Object.hasOwn(QUEST_PROFILES,quality.value))return;vrOptions.profile=quality.value as QuestProfile;const url=new URL(location.href);url.searchParams.set("quality",quality.value);history.replaceState(null,"",url);});
  enter.addEventListener("click",()=>{
    if(vr.session.session||vr.session.snapshot.phase==="starting")void vr.session.exit();
    else void vr.session.enter();
  });
  const keyboard=(event:KeyboardEvent)=>{
    if(event.repeat||vr.session.session||event.ctrlKey||event.metaKey||event.altKey)return;
    const target=event.target as HTMLElement|null;
    if(target?.closest("input,select,textarea"))return;
    if((event.code==="Space"||event.code==="Enter")&&target?.closest("button,a"))return;
    if(event.code==="KeyE"||event.code==="Space"||event.code==="Enter"){event.preventDefault();primaryAction();}
    if(event.code==="KeyF"){event.preventDefault();if(document.fullscreenElement)void document.exitFullscreen().catch(()=>undefined);else void root.requestFullscreen?.().catch(()=>undefined);}
  };
  window.addEventListener("keydown",keyboard);
  const pointer=(event:PointerEvent)=>{
    if(vr.session.session||!visualReady||event.button!==0)return;
    const rect=host.renderer.domElement.getBoundingClientRect();
    ndc.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(ndc,host.camera);raycaster.far=8;
    const hit=pick(false);
    if(under(hit?.object,NACRE.cell)&&mission.phase==="cell"){event.preventDefault();event.stopImmediatePropagation();mission.take("desktop");moveHeld();}
    else if(under(hit?.object,NACRE.socket)&&mission.holding){event.preventDefault();event.stopImmediatePropagation();mission.move("desktop",point.fromArray(NACRE.dock),rotation.identity());mission.release("desktop");}
    else if(under(hit?.object,"nacre-control")){event.preventDefault();event.stopImmediatePropagation();mission.activate();}
  };
  host.renderer.domElement.addEventListener("pointerdown",pointer,{capture:true});
  const audible=()=>{mission.setAudible(!document.hidden&&(!vr.session.session||vr.session.session.visibilityState==="visible"));host.audio.sync();};
  document.addEventListener("visibilitychange",audible);
  const sessionOff=vr.session.subscribe(({phase})=>{
    ui.dataset.immersive=String(phase==="active");quality.disabled=phase==="active"||phase==="starting";consoleGroup.visible=phase==="active";
    if (phase === "active" && mission.phase === "standby") mission.begin();
    if(vr.session.session!==lastSession){
      sessionVisibilityOff?.();sessionVisibilityOff=null;lastSession=vr.session.session;
      if(lastSession){const session=lastSession;session.addEventListener("visibilitychange",audible);sessionVisibilityOff=()=>session.removeEventListener("visibilitychange",audible);}
    }
    audible();if(phase==="ready")resizePreview();
  });
  const motionChanged = () => {
    if (reducedMotion.matches && movingView && !vr.session.session) view(viewIndex);
  };
  reducedMotion.addEventListener("change", motionChanged);
  function resizePreview(){
    if(vr.session.session)return;
    const compact=root.clientWidth<650,width=root.clientWidth,height=root.clientHeight;
    host.camera.fov=previewView===2?(compact?108:70):(compact?75:previewFov);
    host.camera.clearViewOffset();
    if(compact&&previewView===2&&width>0&&height>0)host.camera.setViewOffset(width,height,0,Math.round(height*.16),width,height);
    host.camera.updateProjectionMatrix();
    if(compact!==compactUi){menu.open=!compact;compactUi=compact;}
  }
  window.addEventListener("resize",resizePreview);resizePreview();
  const failedRequiredModel = () => models.some(entity => !OPTIONAL_MODELS.has(entity.id) && entity.asset?.status === "error");
  function resetReadiness(error: typeof loadError = null) {
    loadVersion++;
    readyOff?.();
    readyOff = null;
    visualReady = warming = false;
    loadError = error;
    loadStarted = performance.now();
  }
  const contextLost = (event: Event) => {
    event.preventDefault();
    resetReadiness("context");
  };
  const contextRestored = () => {
    resetReadiness();
    host.requestRender();
  };
  const canvas = host.renderer.domElement;
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  retry.addEventListener("click", () => {
    if (host.renderer.getContext().isContextLost()) { location.reload(); return; }
    if (failedRequiredModel() || loadError === "timeout") {
      const document = host.api.export();
      if (!document || !host.api.create(document).ok) {
        announce("La station n’a pas pu être rechargée.");
        return;
      }
    } else {
      resetReadiness();
    }
    host.requestRender();
    prepareVisuals();
  });
  function prepareVisuals() {
    if (visualReady || disposed || loadError || failedRequiredModel()) return;
    if (performance.now() - loadStarted > READY_TIMEOUT_MS) { resetReadiness("timeout"); return; }
    if (warming || models.some(entity => !OPTIONAL_MODELS.has(entity.id) && entity.asset?.status !== "ready")) return;
    warming=true;const version=loadVersion;
    void Promise.resolve().then(()=>{
      if (disposed || version !== loadVersion) return;
      return host.renderer.compileAsync(host.scene,vr.session.session?vr.camera:host.camera);
    }).then(()=>{
      if(disposed||version!==loadVersion)return;
      const compiledFrame=host.frameCount;
      readyOff=host.subscribeFrame(()=>{
        if(host.frameCount<=compiledFrame||host.renderer.getContext().isContextLost()||host.diagnostics.snapshot().calls===0)return;
        readyOff?.();readyOff=null;visualReady=true;warming=false;
      });host.requestRender();
    }).catch(()=>{if(disposed||version!==loadVersion)return;resetReadiness("render");});
  }
  const assetOff=host.world.subscribeEvents(event=>{
    if(event.type==="world.loaded"){held=null;resetReadiness();}
    if(event.type.startsWith("asset.")||["world.loaded","entity.spawned","entity.removed"].includes(event.type)){models=host.api.query({type:"model"});prepareVisuals();}
  });
  const frameOff=host.subscribeFrame(delta=>{
    mission.tick();moveHeld();prepareVisuals();uiClock+=delta;
    if(movingView&&host.camera.position.distanceTo(scratch.fromArray(VIEWS[viewIndex].position))<.005)movingView=false;
    if(viewIndex===2&&mission.phase==="ready"){(vr.session.session?vr.camera:host.camera).getWorldPosition(point);mission.complete(point);}
    if(uiClock<.12)return;uiClock=0;
    const phase=mission.phase,progress=mission.progress,diagnostic=host.diagnostics.snapshot();
    const xrPhase=vr.session.snapshot.phase;
    const xrFailure = xrPhase === "error" ? (vr.session.session
      ? "La sortie VR a échoué. Réessayez de quitter la VR."
      : "L’entrée en VR a échoué. Vérifiez les autorisations du casque, puis réessayez.") : null;
    const failure = failedRequiredModel() ? "Un élément essentiel de la station n’a pas pu être chargé."
      : loadError === "render" ? "La préparation du rendu a échoué."
      : loadError === "context" ? "Le contexte graphique a été perdu."
      : loadError === "timeout" ? "La station met trop de temps à se préparer." : null;
    const stepFailure = mission.needsRetry ? "La station n’a pas pu terminer cette étape. Réessayez." : null;
    const incompleteDecor = visualReady && models.some(entity => OPTIONAL_MODELS.has(entity.id) && entity.asset?.status === "error");
    if(mission.notice&&mission.notice!==lastMissionNotice){announce(mission.notice);lastMissionNotice=mission.notice;}
    status.dataset.error=String(!!(failure || xrFailure || stepFailure));
    const statusText=failure??xrFailure??(!visualReady?"Préparation de la station…":stepFailure??(performance.now()<noticeUntil?notice:incompleteDecor?"Une partie du décor est indisponible.":phase?HELP[phase]:"Exploration libre"));
    if (status.textContent !== statusText) status.textContent = statusText;
    status.classList.toggle("nacre-loading",!visualReady&&!failure);
    retry.hidden = !failure;
    retry.textContent = loadError === "context" ? "Recharger la page" : "Réessayer le chargement";
    ui.dataset.phase=phase??"explore";
    objective.textContent=phase?HELP[phase]:"Votre station sauvegardée reste explorable.";
    headline.innerHTML=phase==="complete"?"Le signal<br>est revenu.":phase==="standby"?"Ramenez<br>la lumière.":"Rétablir<br>le signal.";
    primary.disabled=!visualReady||(!stepFailure&&(phase==="charging"||phase==="opening"||(phase==="carrying"&&viewIndex===1&&movingView)));
    primary.textContent=failure?"Chargement interrompu":!visualReady?"Préparation…":stepFailure?"Réessayer l’étape":phase==="standby"?"Commencer la mission":phase==="cell"?"Saisir la cellule":phase==="carrying"?(viewIndex===1?(movingView?"Approche du réacteur…":"Insérer la cellule"):"Aller au réacteur"):phase==="docked"?"Lancer le réacteur":phase==="charging"?"Recharge · "+Math.round(progress*100)+" %":phase==="opening"?"Ouverture · "+Math.round(progress*100)+" %":phase==="ready"?"Rejoindre le belvédère":phase==="complete"?"Rejouer la mission":"Nouvelle mission";
    const index=phase?["standby","cell","carrying","docked","charging","opening","ready","complete"].indexOf(phase):0;
    ui.querySelectorAll<HTMLElement>(".nacre-steps li").forEach((li,i)=>li.dataset.done=String(index>=[3,5,7][i]));
    charge.hidden=phase!=="charging"&&phase!=="opening";charge.value=progress;
    const viewButton=ui.querySelector<HTMLButtonElement>('[data-view="2"]')!;viewButton.disabled=!!phase&&!["ready","complete"].includes(phase);
    soundButton.setAttribute("aria-pressed",String(mission.muted));soundButton.textContent=mission.muted?"Son coupé":"Son activé";
    const nextLabel=(phase==="complete"?"REJOUER":"CELLULE")+":"+mission.muted+":"+mission.needsRetry;
    if(nextLabel!==buttonLabel){drawPanel(buttons[0].mesh,phase==="complete"?"REJOUER":"CELLULE");drawPanel(buttons[2].mesh,stepFailure?"RÉESSAYER":"ALLUMER");drawPanel(buttons[4].mesh,mission.muted?"MUET":"SON");buttonLabel=nextLabel;}
    enter.disabled=(!visualReady&&!vr.session.session&&xrPhase!=="starting")||["checking","unsupported","stopping","disposed"].includes(xrPhase);
    enter.textContent=xrPhase==="starting"?"Annuler":vr.session.session?"Quitter la VR":xrFailure?"Réessayer la VR":"Entrer en VR";
    stats.textContent=diagnostic.scope+" · "+(diagnostic.observedHz??"—")+" Hz observés\nTrame p95 "+(diagnostic.intervalMs.p95??"—")+" ms · CPU p95 "+(diagnostic.cpuSubmissionMs.p95??"—")+" ms\n"+diagnostic.calls+" appels · "+diagnostic.triangles.toLocaleString("fr-CA")+" triangles\nGPU non mesuré";
    const text=stepFailure?"ÉTAPE INTERROMPUE\nPOINTEZ RÉESSAYER":(phase?HELP[phase]:"EXPLORATION LIBRE")+"\n"+(phase==="cell"?"POIGNÉE / PINCEMENT POUR SAISIR":phase==="carrying"?"RELÂCHEZ DANS LE SOCLE":phase==="docked"?"POINTEZ ALLUMER":phase==="charging"||phase==="opening"?Math.round(progress*100)+" %":"NACRE / ORBITAL OBSERVATORY");
    if(text!==drawnPanel){drawPanel(metric,text);drawnPanel=text;}
  });

  const debug=window as unknown as Record<string,unknown>,previousText=debug.render_game_to_text,previousTime=debug.advanceTime;
  const screen=(id:string)=>{
    const o=host.world.getEntityObject(id);if(!o)return null;o.getWorldPosition(point);point.project(host.camera);
    const rect=host.renderer.domElement.getBoundingClientRect();
    return{x:Math.round(rect.left+(point.x+1)*rect.width/2),y:Math.round(rect.top+(1-point.y)*rect.height/2)};
  };
  const readText=()=>JSON.stringify({
    coordinates:"metres; +Y up; forward -Z",ready:visualReady,phase:mission.phase,progress:Number(mission.progress.toFixed(3)),objective:mission.phase?HELP[mission.phase]:"Exploration libre",
    holding:mission.holding,cancelled:lastCancelled,view:viewIndex,
    cell:{position:host.world.getEntityObject(NACRE.cell)?.getWorldPosition(new Vector3()).toArray(),screen:screen(NACRE.cell)},
    socket:{position:NACRE.dock,screen:screen("nacre-socket-base")},doors:["nacre-door-left","nacre-door-right"].map(id=>host.world.getEntityObject(id)?.position.toArray()),
    audio:{muted:mission.muted,playing:host.audio.playingCount,tracked:host.audio.trackedCount},xr:vr.session.snapshot.phase,
  });
  const advanceTime=async(ms:number)=>{
    if(!Number.isFinite(ms)||ms<0||ms>30000)throw Error("Advance time must be 0..30000 ms.");
    if(loadError||failedRequiredModel())throw Error("NACRE could not prepare its rendering.");
    if(!visualReady||movingView)await new Promise<void>((resolve,reject)=>{
      const off=host.subscribeFrame(()=>{
        if(disposed||loadError||failedRequiredModel()){off();reject(Error("NACRE could not prepare its rendering."));}
        else if(visualReady&&!movingView){off();resolve();}
      });host.requestRender();
    });
    if(!manualTime){manualTime=true;host.api.pause(true);}
    manualRemainder+=ms;const frameMs=1000/60,steps=Math.floor((manualRemainder+.000001)/frameMs);
    manualRemainder-=steps*frameMs;
    if(vr.session.session)vr.input.setActive(vr.session.snapshot.phase==="active"&&vr.session.session.visibilityState==="visible");
    for(let i=0;i<steps;i++){host.api.step(1/60);if(vr.session.session)vr.input.update(1/60);mission.tick();moveHeld();}
    host.audio.sync();host.scene.updateMatrixWorld(true);
    host.requestRender();
  };
  const diagnostics={host,vr,mission,view,get profile(){return vrOptions.profile;},get visualReady(){return visualReady;},get holding(){return mission.holding;},get cancelled(){return lastCancelled;}};
  Object.assign(debug,{__GRAPHYSX__:host.api,__GRAPHYSX_QUEST3__:diagnostics,render_game_to_text:readText,advanceTime});
  const pageHide=()=>{void dispose();};window.addEventListener("pagehide",pageHide);
  async function dispose() {
    if(disposed)return;await vr.dispose();if(vr.session.session)return;
    disposed=true;loadVersion++;readyOff?.();sessionVisibilityOff?.();frameOff();assetOff();sessionOff();mission.dispose();
    window.removeEventListener("resize",resizePreview);window.removeEventListener("keydown",keyboard);window.removeEventListener("pagehide",pageHide);
    window.removeEventListener("storage", storageChanged);
    reducedMotion.removeEventListener("change", motionChanged);
    canvas.removeEventListener("webglcontextlost", contextLost);
    canvas.removeEventListener("webglcontextrestored", contextRestored);
    document.removeEventListener("visibilitychange",audible);host.renderer.domElement.removeEventListener("pointerdown",pointer,{capture:true});
    if(debug.render_game_to_text===readText)debug.render_game_to_text=previousText;
    if(debug.advanceTime===advanceTime)debug.advanceTime=previousTime;
    if(debug.__GRAPHYSX_QUEST3__===diagnostics)delete debug.__GRAPHYSX_QUEST3__;
    if(debug.__GRAPHYSX__===host.api)delete debug.__GRAPHYSX__;
    disposeVrObject(decor);decor.removeFromParent();ui.remove();host.dispose();
  }
  return{dispose};
}
