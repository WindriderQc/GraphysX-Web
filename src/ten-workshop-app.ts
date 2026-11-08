import { Plane, Raycaster, Vector2, Vector3, type Object3D } from "three";
import type { PlatformHost } from "./platform-host";
import { createMathLabState, getCounts, getPracticeQuestion, getPracticeProgress, getPracticeLength, setPracticeFamily, setPracticeOperation, moveToken, nextPracticeQuestion, revealPracticeHint, restoreMathLabState, resetPractice, serializeMathLabState, submitPracticeAnswer, undoMove, type Group, type PracticeOperation } from "./ten-workshop-model";
import { MATH_THEMES, readMathTheme, type MathTheme } from "./ten-workshop-theme";
import { composeMathLab, type LabShape } from "./ten-workshop-scene";
import "./ten-workshop.css";
import { mountMathLabLevels } from "./math-lab-navigation";
import { mountMathExplorer } from "./math-lab-explorer";

export type TenWorkshopApplication = { state: () => unknown; advanceTime: (milliseconds: number) => unknown; dispose: () => void };
const SESSION = "graphysx.math-lab.v1";
const THEMES = "graphysx.math-themes.v1";
export function mountTenWorkshop(root: HTMLElement, host: PlatformHost, onExit: () => void): TenWorkshopApplication {
  const { api } = host;
  const title = document.title, language = document.documentElement.lang;
  document.title = "Math Lab | Les amis de 10";
  document.documentElement.lang = "fr";
  let state = createMathLabState(), theme = structuredClone(MATH_THEMES[0]), mode: "discover" | "practice" | "workshop" | "explore" = "discover";
  let disposed = false;
  let savedExplorer: unknown = null;
  let shape: LabShape = "box", selected: number | null = null, answer = "", reference = false, notice = "", savedThemes: MathTheme[] = [];
  try {
    const raw = localStorage.getItem(SESSION);
    if(raw && raw.length < 150000) {
      const v = JSON.parse(raw) as Record<string, unknown>;
      state = restoreMathLabState(JSON.stringify(v.math)) ?? state;
      theme = readMathTheme(v.theme) ?? theme;
      if(v.mode === "practice" || v.mode === "workshop" || v.mode === "explore") mode = v.mode;
      savedExplorer=v.explorer;
      if(v.shape === "sphere" || v.shape === "cylinder") shape = v.shape;
      if(v.reference === true) reference = true;
    }
    const list: unknown = JSON.parse(localStorage.getItem(THEMES) || "[]");
    if(Array.isArray(list)) savedThemes = list.slice(0,24).map(readMathTheme).filter((t): t is MathTheme => t !== null);
  } catch { notice = "La sauvegarde locale était indisponible. L’atelier reste utilisable."; }
  const surface = document.createElement("main");
  surface.className = "gx-ten";
  surface.innerHTML = `<header class="tw-header"><button data-exit>← Centre</button><strong>Math Lab</strong><button data-frame>Recentrer</button></header>
    <div class="tw-scene-note"><span data-season></span><small>Même jardin, mêmes règles.</small></div>
    <section class="tw-panel" aria-labelledby="tw-title"><div data-levels></div><p class="tw-eyebrow">NOMBRES ET CALCULS</p><h1 id="tw-title">Nombres en <em>3D</em></h1><p class="tw-intro">Compter, réunir, déplacer, trouver.<br>Un même monde pour explorer les maths.</p>
    <nav class="tw-tabs" aria-label="Activité"><button data-mode="discover">Manipuler 10</button><button data-mode="practice">Pratiquer</button><button data-mode="explore">Explorer</button></nav>
    <div data-explore hidden></div>
    <div data-discover><p class="tw-equation" data-equation></p><p>Choisis un objet, puis le groupe A ou B. Tu peux aussi le glisser sur la table 3D.</p><div class="tw-tokens" aria-label="Les dix objets" data-tokens></div><div class="tw-row"><button data-target="A">Vers A</button><button data-target="B">Vers B</button><button data-undo>Annuler</button></div><p data-selection></p><p data-counts></p><p class="tw-relation" data-subtract-relation></p><details><summary data-pairs-summary></summary><ol data-pairs></ol></details></div>
    <div data-practice hidden><div class="tw-row" aria-label="Type de calcul"><button data-operation="complement">Compléter 10</button><button data-operation="subtract">Soustraire de 10</button><button data-operation="add20">Additions 0–20</button><button data-operation="subtract20">Soustractions 0–20</button></div><div data-family-wrap hidden><label for="tw-family" data-family-label></label><select id="tw-family"></select><p data-family-summary></p></div><p class="tw-equation" data-question></p><p data-prompt></p><form data-answer-form><label for="tw-answer" data-answer-label>Le nombre manquant</label><input id="tw-answer" inputmode="numeric" autocomplete="off" maxlength="2" aria-describedby="tw-feedback"><div class="tw-keypad" aria-label="Calculatrice" data-keypad></div><button class="tw-primary" type="submit">Vérifier</button></form><div class="tw-row"><button data-hint>Un indice</button><button data-next>Suivant →</button></div><p data-hint-text></p><p data-progress></p><button data-restart hidden>Recommencer la pratique</button></div>
    <div data-workshop hidden><h2>Un thème, deux scènes</h2><p>Couleurs, matières et lumière. Tes réglages ne changent jamais les calculs.</p><label for="tw-reference"><input type="checkbox" id="tw-reference"> Voir cube, sphère et cylindre de référence</label><div class="tw-colors" data-colors></div><label for="tw-roughness">Matière : lisse à mate</label><input id="tw-roughness" type="range" min="0.2" max="1" step="0.05"><label for="tw-light">Lumière</label><input id="tw-light" type="range" min="0.5" max="3" step="0.1"><label for="tw-theme-name">Nom du thème</label><input id="tw-theme-name" maxlength="64"><div class="tw-row"><button data-save-theme>Garder ce thème</button><button data-export-theme>Exporter JSON</button></div><label for="tw-saved">Mes thèmes dans ce navigateur</label><select id="tw-saved"><option value="">Choisir…</option></select><label class="tw-import">Importer un thème JSON<input type="file" accept="application/json,.json" data-import-theme></label><details><summary>Ajouter mes modèles et textures</summary><p>1. Enregistre une copie de cette scène ci-dessous et ouvre-la dans l’éditeur existant.</p><p>2. Library → Media → Import from Datalake convertit les modèles pris en charge. Le glisser-déposer direct de GLB/FBX/OBJ ne les convertit pas encore.</p><p>3. Ajuste les couleurs des matériaux du modèle. Les textures de la bibliothèque s’appliquent aux primitives; les textures PBR des modèles et HDR/EXR personnels ne sont pas un parcours complet.</p><p>Vérifie les droits avant tout import. Les fichiers du service d’actifs peuvent être accessibles publiquement. N’y dépose pas de preuve d’achat ni d’actif acheté sans autorisation de redistribution.</p></details><button data-save-scene>Créer une copie pour l’éditeur</button><a data-editor hidden>Ouvrir la copie dans l’éditeur →</a><small>La copie est une scène visuelle éditable, pas une nouvelle activité mathématique. L’éditeur possède les bibliothèques existantes.</small></div>
    <p id="tw-feedback" class="tw-feedback" role="status" aria-live="polite"></p><footer><button data-mode="workshop">Thèmes (facultatif)</button><div class="tw-row" aria-label="Saison"><button data-theme="summer">☀ Été</button><button data-theme="winter">❄ Hiver</button></div><label for="tw-shape">Objets à compter</label><select id="tw-shape"><option value="box">Cubes</option><option value="sphere">Sphères</option><option value="cylinder">Cylindres</option></select><small>Sans chronomètre. Sans compte. Tout fonctionne à l’écran et au clavier. L’activité complète se joue à l’écran. La VR reste un essai adulte séparé, non activé ici.</small></footer></section>`;
  root.append(surface);
  mountMathLabLevels(surface.querySelector<HTMLElement>("[data-levels]")!, "numbers");
  document.documentElement.classList.add("ten-workshop-active");
  const $ = <T extends HTMLElement = HTMLElement>(s: string): T => surface.querySelector<T>(s)!;
  const input = $<HTMLInputElement>("#tw-answer");
  const persist = () => { try { localStorage.setItem(SESSION,JSON.stringify({math:JSON.parse(serializeMathLabState(state)),theme,mode,shape,reference,explorer:explorer.state()})); } catch { notice = "Stockage indisponible : garde cette page ouverte ou exporte ton thème."; } };
  const compact = matchMedia("(max-width: 760px)");
  const frame = () => host.frameView(compact.matches ? [10,16,21] : [10,12,17], compact.matches ? [0,-5.1,0] : [-3.3,1.1,0.5],0);
  const equationOf = (q: NonNullable<ReturnType<typeof getPracticeQuestion>>, result: string) => q.operation === "add20" ? `${q.a}+${q.total-q.a}=${result}` : q.operation === "subtract" || q.operation === "subtract20" ? `${q.total}-${q.a}=${result}` : `${q.a}+${result}=10`;
  const renderScene = () => {
    const counts=getCounts(state), q=getPracticeQuestion(state), practice=mode==="practice";
    const equation=practice?(q?equationOf(q,getPracticeProgress(state).status==="correct"?String(q.expected):"?"):""):`${counts.a}+${counts.b}=10`;
    const result=api.create(composeMathLab(theme,{tokens:state.tokens,practice,operation:state.practice.operation,hint:getPracticeProgress(state).hintVisible,a:q?.a??0,total:q?.total??10,equation,answer:practice?answer:"10",reference:mode==="workshop"&&reference,selected,shape,explorer:mode==="explore"?explorer.picture():undefined}));
    if(!result.ok) throw new Error(result.error??"La scène n’a pas pu être composée.");
    api.pause(true);
  };
  const refresh = (scene=true) => {
    const counts=getCounts(state), q=getPracticeQuestion(state);
    $("[data-discover]").hidden=mode!=="discover"; $("[data-practice]").hidden=mode!=="practice"; $("[data-workshop]").hidden=mode!=="workshop"; $("[data-explore]").hidden=mode!=="explore";
    surface.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===mode)));
    surface.querySelectorAll<HTMLButtonElement>("[data-theme]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.theme===theme.season)));
    $("[data-season]").textContent=theme.label; $("[data-equation]").textContent=`${counts.a} + ${counts.b} = 10`;
    $("[data-subtract-relation]").textContent=`On peut aussi lire : 10 − ${counts.a} = ${counts.b}. On met ${counts.a} objets de côté dans A; il en reste ${counts.b} dans B.`;
    $("[data-counts]").textContent=`Groupe A : ${counts.a}. Groupe B : ${counts.b}. Toujours 10 objets.`;
    $("[data-selection]").textContent=selected===null?"Chaque objet vaut 1, quelle que soit sa forme.":`Objet ${selected+1} sélectionné. Choisis sa destination.`;
    surface.querySelectorAll<HTMLButtonElement>("[data-target]").forEach(b=>b.disabled=selected===null);
    $<HTMLButtonElement>("[data-undo]").disabled=!state.history.length;
    surface.querySelectorAll<HTMLButtonElement>("[data-token]").forEach(b=>{const token=state.tokens[Number(b.dataset.token)];b.textContent=`${token.id+1} · ${token.group}`;b.setAttribute("aria-label",`Objet ${token.id+1}, groupe ${token.group}`);b.setAttribute("aria-pressed",String(token.id===selected));b.dataset.group=token.group;});
    $("[data-pairs-summary]").textContent=`${state.discovered.length} / 11 paires découvertes`;
    $("[data-pairs]").replaceChildren(...[...state.discovered].sort((a,b)=>a-b).map(a=>{const li=document.createElement("li");li.textContent=`${a} + ${10-a} = 10`;return li;}));
    $("[data-question]").textContent=q?equationOf(q,getPracticeProgress(state).status==="correct"?String(q.expected):"?").replaceAll("-"," − ").replaceAll("+"," + ").replaceAll("="," = "):`Les ${getPracticeLength(state)} calculs sont réussis ! Choisis une autre série ou rejoue celle-ci.`;
    const subtraction=state.practice.operation==="subtract"||state.practice.operation==="subtract20";
    const curriculum=state.practice.operation==="add20"||state.practice.operation==="subtract20";
    $("[data-family-wrap]").hidden=!curriculum;
    $("[data-family-label]").textContent=subtraction?"Nombre de départ (0 à 20)":"Premier nombre (0 à 20)";
    $<HTMLSelectElement>("#tw-family").value=String(state.practice.family);
    if(curriculum){const families=state.practice[state.practice.operation as "add20"|"subtract20"];$("[data-family-summary]").textContent=`${families.reduce((sum,p)=>sum+p.solved.length,0)} / 231 calculs réussis dans ce parcours. Choisis librement une courte série.`;}
    $("[data-prompt]").textContent=subtraction?`On part de ${q?.total??state.practice.family}. On met les objets A de côté. Combien reste-t-il dans B ?`:state.practice.operation==="add20"?"Réunis les deux groupes. Combien y a-t-il en tout ?":"Combien manque-t-il pour faire 10 ?";
    $("[data-answer-label]").textContent=subtraction?"Le nombre restant":state.practice.operation==="add20"?"Le total des deux groupes":"Le nombre manquant";
    surface.querySelectorAll<HTMLButtonElement>("[data-operation]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.operation===state.practice.operation)));
    $<HTMLButtonElement>("[data-next]").disabled=getPracticeProgress(state).status!=="correct";
    $<HTMLButtonElement>("[data-hint]").disabled=!q||getPracticeProgress(state).hintVisible;
    input.disabled=!q||getPracticeProgress(state).status==="correct";
    $("[data-answer-form]").querySelectorAll<HTMLButtonElement>("button").forEach(b=>b.disabled=input.disabled);
    $("[data-hint-text]").textContent=q&&getPracticeProgress(state).hintVisible?((q.operation==="subtract"||q.operation==="subtract20")?`Indice : sur les ${q.total} objets, ${q.a} sont mis de côté dans A, barrés dans la scène. Il reste ${q.expected} objets dans B. Chaque objet vaut 1.`:`Indice : groupe A, ${q.a} objets; groupe B, ${q.operation==="add20"?q.total-q.a:q.expected} objets. Compte les objets de l’autre groupe sur la table. Chaque objet vaut 1.`):"";
    $("[data-restart]").hidden=Boolean(q);
    $("[data-progress]").textContent=`${getPracticeProgress(state).solved.length} / ${getPracticeLength(state)} calculs réussis. Tu peux prendre ton temps.`;
    $("#tw-feedback").textContent=notice;
    $<HTMLSelectElement>("#tw-shape").value=shape;
    $<HTMLInputElement>("#tw-reference").checked=reference;
    $<HTMLInputElement>("#tw-roughness").value=String(theme.roughness);
    $<HTMLInputElement>("#tw-light").value=String(theme.light);
    surface.querySelectorAll<HTMLInputElement>("[data-color]").forEach(i=>i.value=theme.palette[i.dataset.color as keyof MathTheme["palette"]]);
    if(mode==="explore"){try{history.replaceState(null,"",explorer.hash());}catch{/* Local activity remains usable. */}}
    if(scene)renderScene(); persist(); $("#tw-feedback").textContent=notice;
  };
  const explorer=mountMathExplorer($("[data-explore]"),savedExplorer,()=>{cancelPointer();selected=null;refresh();});
  if(explorer.applyHash(location.hash)) mode="explore";
  const hashChanged=()=>{if(explorer.applyHash(location.hash)){cancelPointer();selected=null;mode="explore";refresh();}};
  window.addEventListener("hashchange",hashChanged);
  const move = (target: Group) => {if(selected===null||mode!=="discover")return;const previous=state;state=moveToken(state,selected,target);notice=previous===state?"Cet objet est déjà dans ce groupe.":`Objet déplacé vers ${target}. Le total reste 10.`;selected=null;refresh();};
  const submit=()=>{if(mode!=="practice")return;state=submitPracticeAnswer(state,answer);notice=getPracticeProgress(state).status==="correct"?((state.practice.operation==="subtract"||state.practice.operation==="subtract20")?"Oui ! Tu as trouvé le nombre restant. Passe au calcul suivant quand tu veux.":"Oui ! Tu as trouvé. Passe au calcul suivant quand tu veux."):getPracticeProgress(state).status==="invalid"?`Entre un nombre entier de 0 à ${state.practice.operation==="add20"||state.practice.operation==="subtract20"?20:10}. Zéro est une réponse possible.`:"Pas encore. Tu peux réessayer ou demander un indice.";refresh();};
  const key=(value:string)=>{if(mode!=="practice"||!getPracticeQuestion(state)||getPracticeProgress(state).status==="correct")return;if(value==="enter"){submit();return;}answer=value==="C"?"":value==="<"?answer.slice(0,-1):(answer+value).slice(0,2);input.value=answer;notice="";refresh();};
  for(let id=0;id<10;id++){const b=document.createElement("button");b.dataset.token=String(id);b.addEventListener("click",()=>{selected=selected===id?null:id;refresh();});$("[data-tokens]").append(b);}
  for(const value of ["1","2","3","4","5","6","7","8","9","C","0","<"]){const b=document.createElement("button");b.type="button";b.textContent=value==="C"?"Vider":value==="<"?"⌫":value;b.setAttribute("aria-label",value==="<"?"Effacer le dernier chiffre":b.textContent);b.addEventListener("click",()=>key(value));$("[data-keypad]").append(b);}
  for(const [name,label] of Object.entries({ground:"Sol",foliage:"Sapin",primary:"Objets A",secondary:"Objets B",table:"Table",sky:"Ciel"})){const l=document.createElement("label"),i=document.createElement("input");i.type="color";i.dataset.color=name;l.append(label,i);i.addEventListener("input",()=>{theme={...theme,palette:{...theme.palette,[name]:i.value}};notice="Aperçu modifié. Garde le thème pour le réutiliser.";refresh();});$("[data-colors]").append(l);}
  const themeList=()=>{$<HTMLSelectElement>("#tw-saved").replaceChildren(new Option("Choisir…",""),...savedThemes.map(t=>new Option(t.label,t.id)));};themeList();
  surface.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b=>b.addEventListener("click",()=>{cancelPointer();mode=b.dataset.mode as typeof mode;if(mode!=="explore"&&/^#(?:compter|additionner)=/.test(location.hash)){try{history.replaceState(null,"",location.pathname+location.search);}catch{/* optional URL state */}}selected=null;notice="";refresh();}));
  surface.querySelectorAll<HTMLButtonElement>("[data-theme]").forEach(b=>b.addEventListener("click",()=>{cancelPointer();selected=null;theme=structuredClone(MATH_THEMES.find(t=>t.id===b.dataset.theme)!);$<HTMLInputElement>("#tw-theme-name").value=theme.label;notice="La saison change. Tes paires et tes réussites sont conservées.";refresh();}));
  surface.querySelectorAll<HTMLButtonElement>("[data-target]").forEach(b=>b.addEventListener("click",()=>move(b.dataset.target as Group)));
  $("[data-undo]").addEventListener("click",()=>{state=undoMove(state);selected=null;notice="Dernier déplacement annulé.";refresh();});
  $("[data-answer-form]").addEventListener("submit",e=>{e.preventDefault();submit();});
  input.addEventListener("input",()=>{answer=input.value;renderScene();});
  surface.querySelectorAll<HTMLButtonElement>("[data-operation]").forEach(b=>b.addEventListener("click",()=>{cancelPointer();state=setPracticeOperation(state,b.dataset.operation as PracticeOperation);answer="";input.value="";notice="Ta progression est gardée séparément pour chaque type de calcul.";refresh();}));
  for(let family=0;family<=20;family++)$<HTMLSelectElement>("#tw-family").append(new Option(String(family),String(family)));
  $("#tw-family").addEventListener("change",()=>{cancelPointer();state=setPracticeFamily(state,Number($<HTMLSelectElement>("#tw-family").value));answer="";input.value="";notice="Chaque série garde ses réussites. Tu peux changer quand tu veux.";refresh();});
  $("[data-next]").addEventListener("click",()=>{state=nextPracticeQuestion(state);answer="";input.value="";notice="";refresh();input.focus();});
  $("[data-restart]").addEventListener("click",()=>{state=resetPractice(state);answer="";input.value="";notice="Nouvelle pratique. Tes découvertes et ton thème sont conservés.";refresh();input.focus();});
  $("[data-hint]").addEventListener("click",()=>{state=revealPracticeHint(state);notice=(state.practice.operation==="subtract"||state.practice.operation==="subtract20")?"Les objets restants apparaissent dans B. Ceux de A sont mis de côté et barrés.":"L’autre groupe apparaît sur la table. Compte ses objets.";refresh();});
  $<HTMLSelectElement>("#tw-shape").addEventListener("change",e=>{cancelPointer();shape=(e.target as HTMLSelectElement).value as LabShape;selected=null;refresh();});
  $<HTMLInputElement>("#tw-reference").addEventListener("change",e=>{reference=(e.target as HTMLInputElement).checked;refresh();});
  for(const field of ["roughness","light"] as const)$<HTMLInputElement>(`#tw-${field}`).addEventListener("input",e=>{theme={...theme,[field]:Number((e.target as HTMLInputElement).value)};refresh();});
  $<HTMLInputElement>("#tw-theme-name").value=theme.label;
  $("[data-save-theme]").addEventListener("click",()=>{const label=$<HTMLInputElement>("#tw-theme-name").value.trim();if(!label){notice="Donne un nom à ton thème.";refresh(false);return;}if(savedThemes.length>=24){notice="24 thèmes sont déjà conservés. Exporte le thème pour garder une copie.";refresh(false);return;}const t={...structuredClone(theme),id:`custom-${Date.now()}`,label};try{localStorage.setItem(THEMES,JSON.stringify([...savedThemes,t]));savedThemes.push(t);theme=t;themeList();notice="Thème conservé dans ce navigateur. Réutilise-le dans la liste.";}catch{notice="Le thème n’a pas pu être sauvegardé. Tu peux l’exporter en JSON.";}refresh(false);});
  $("#tw-saved").addEventListener("change",e=>{const t=savedThemes.find(t=>t.id===(e.target as HTMLSelectElement).value);if(t){theme=structuredClone(t);$<HTMLInputElement>("#tw-theme-name").value=t.label;notice="Thème repris, activité inchangée.";refresh();}});
  $("[data-export-theme]").addEventListener("click",()=>{const label=$<HTMLInputElement>("#tw-theme-name").value.trim();const exported={...theme,label:label||theme.label};const url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=`${theme.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $("[data-import-theme]").addEventListener("change",e=>{const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;if(file.size>20000){notice="Thème refusé : maximum 20 Ko.";refresh(false);return;}void file.text().then(text=>{if(disposed)return;let t:MathTheme|null=null;try{t=readMathTheme(JSON.parse(text));}catch{/* invalid JSON */}if(t){theme=t;$<HTMLInputElement>("#tw-theme-name").value=t.label;notice="Thème importé localement. Aucun fichier envoyé.";}else notice="Thème invalide : le fichier doit respecter le format v1, sans actif externe.";refresh();}).catch(()=>{if(disposed)return;notice="Lecture du fichier impossible.";refresh(false);});});
  $("[data-save-scene]").addEventListener("click",()=>{const name=`Math Lab · ${theme.label} · ${new Date().toISOString()}`;const result=api.save(name);const link=$<HTMLAnchorElement>("[data-editor]");if(result.ok){link.href=import.meta.env.BASE_URL+"?host=editor&localScene="+encodeURIComponent(name);link.hidden=false;notice="Copie enregistrée dans les scènes locales. Ton activité reste ici.";}else notice=result.error??"Impossible d’enregistrer la scène.";refresh(false);});
  $("[data-exit]").addEventListener("click",onExit);$("[data-frame]").addEventListener("click",frame);
  // One host, one loop, one canonical API. Preview never mutates a token before a drop.
  const canvas=host.renderer.domElement, ray=new Raycaster(), point=new Vector2(), table=new Plane(new Vector3(0,1,0),-1.6);
  const aim=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();point.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(point,host.camera);};
  const pick=(e:PointerEvent):string|null=>{aim(e);for(const hit of ray.intersectObjects(host.scene.children,true)){let o:Object3D|null=hit.object;while(o){const id=o.userData.graphysxEntityId;if(typeof id==="string"&&(id.startsWith("lab-token-")||id.startsWith("lab-zone-")||id.startsWith("lab-key-")))return id;o=o.parent;}}return null;};
  let down:{id:string;x:number;y:number;pointer:number}|null=null;
  const cancelPointer=()=>{const d=down;down=null;if(d&&canvas.hasPointerCapture(d.pointer))canvas.releasePointerCapture(d.pointer);canvas.style.cursor="";};
  const cancel=()=>{const pending=down!==null;cancelPointer();if(selected!==null||pending){selected=null;refresh();}};
  const visibility=()=>{if(document.hidden)cancel();};
  const pointerMove=(e:PointerEvent)=>{if(!down||down.pointer!==e.pointerId||!down.id.startsWith("lab-token-")||mode!=="discover")return;e.stopImmediatePropagation();aim(e);const pos=ray.ray.intersectPlane(table,new Vector3());const obj=host.world.getEntityObject(down.id);if(pos&&obj){obj.position.set(Math.max(-2.85,Math.min(2.85,pos.x)),1.94,Math.max(-1.65,Math.min(0.95,pos.z)));canvas.style.cursor="grabbing";}};
  const pointerDown=(e:PointerEvent)=>{if(down){e.stopImmediatePropagation();e.preventDefault();return;}if(mode==="workshop"||mode==="explore"||e.button!==0)return;const id=pick(e);if(!id)return;e.stopImmediatePropagation();e.preventDefault();down={id,x:e.clientX,y:e.clientY,pointer:e.pointerId};canvas.setPointerCapture(e.pointerId);};
  const pointerUp=(e:PointerEvent)=>{if(!down||down.pointer!==e.pointerId)return;e.stopImmediatePropagation();e.preventDefault();const d=down;cancelPointer();const dragged=Math.hypot(e.clientX-d.x,e.clientY-d.y)>8;if(d.id.startsWith("lab-token-")&&mode==="discover"){selected=Number(d.id.slice(10));if(dragged){aim(e);const pos=ray.ray.intersectPlane(table,new Vector3());if(pos&&Math.abs(pos.x)<=2.85&&pos.z>=-1.65&&pos.z<=0.95){move(pos.x<0?"A":"B");return;}selected=null;notice="Déplacement annulé. Choisis un objet puis un groupe.";}refresh();}else if(!dragged&&d.id.startsWith("lab-zone-"))move(d.id.endsWith("A")?"A":"B");else if(!dragged&&d.id.startsWith("lab-key-"))key(d.id.slice(8)==="backspace"?"<":d.id.slice(8));};
  const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")cancel();};
  canvas.addEventListener("pointermove",pointerMove,true);document.addEventListener("visibilitychange",visibility);canvas.addEventListener("pointerdown",pointerDown,true);canvas.addEventListener("pointerup",pointerUp,true);canvas.addEventListener("pointercancel",cancel);window.addEventListener("blur",cancel);window.addEventListener("keydown",escape);compact.addEventListener("change",frame);
  renderScene();frame();refresh(false);
  return {state:()=>({application:"ten-workshop",math:state,theme,mode,shape,reference,explorer:explorer.state()}),advanceTime:()=>api.state(),dispose(){disposed=true;window.removeEventListener("hashchange",hashChanged);cancelPointer();document.removeEventListener("visibilitychange",visibility);canvas.removeEventListener("pointermove",pointerMove,true);canvas.removeEventListener("pointerdown",pointerDown,true);canvas.removeEventListener("pointerup",pointerUp,true);canvas.removeEventListener("pointercancel",cancel);window.removeEventListener("blur",cancel);window.removeEventListener("keydown",escape);compact.removeEventListener("change",frame);surface.remove();document.documentElement.classList.remove("ten-workshop-active");document.title=title;document.documentElement.lang=language;}};
}
