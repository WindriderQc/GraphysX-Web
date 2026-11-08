import type { MathScene } from './llmx-math-scene';
import { KIDS_FIRST, KIDS_START, KIDS_COUNT_PICKS, KIDS_ADD_PICKS, kidsRead, kidsFromHash, kidsStep, kidsAnswer, kidsHash, kidsLimitNote, type KidsPart } from './math-lab-kids';

/** Rules are shared with PR 137; presentation uses the existing interactive world, not another stage. */
export type ExplorerPicture = { scene: MathScene | null; revealed: boolean; regrouped: boolean };
export function mountMathExplorer(parent: HTMLElement, saved: unknown, changed: () => void) {
  let scene: MathScene = KIDS_FIRST, revealed = false, regrouped = false, refusal = '';
  if(saved && typeof saved==='object') {
    const value=saved as Record<string,unknown>;
    if(value.scene && typeof value.scene==='object') {
      const read=kidsRead(value.scene as Record<string,unknown>);
      if(read.ok) { scene=read.scene; revealed=value.revealed===true; regrouped=value.regrouped===true; }
    }
  }
  parent.innerHTML=`<h2>Explorer les nombres</h2><p>Choisis une quantité. Chaque objet vaut 1. Les rangées de dix rendent les grands nombres plus faciles à lire.</p>
    <div class="tw-row" aria-label="Exploration"><button data-explorer-kind="count">Compter</button><button data-explorer-kind="add">Additionner</button></div>
    <div data-explorer-count><p class="tw-equation"><output data-explorer-to></output></p><div class="tw-row"><button data-explorer-part="to" data-delta="-10">−10</button><button data-explorer-part="to" data-delta="-1">−1</button><button data-explorer-part="to" data-delta="1">+1</button><button data-explorer-part="to" data-delta="10">+10</button></div></div>
    <div data-explorer-add hidden><p class="tw-equation"><output data-explorer-a></output> + <output data-explorer-b></output> = <output data-explorer-answer>?</output></p><div class="tw-row"><button data-explorer-part="a" data-delta="-1" aria-label="Un objet de moins dans A">A −1</button><button data-explorer-part="a" data-delta="1" aria-label="Un objet de plus dans A">A +1</button><button data-explorer-part="b" data-delta="-1" aria-label="Un objet de moins dans B">B −1</button><button data-explorer-part="b" data-delta="1" aria-label="Un objet de plus dans B">B +1</button></div><div class="tw-row"><button data-explorer-reveal>Voir le résultat</button><button data-explorer-group>Regrouper par dix</button></div></div>
    <div class="tw-row" data-explorer-picks aria-label="Exemples de nombres"></div><p role="status" data-explorer-status></p><p class="tw-relation" data-explorer-description></p><small>Exploration libre : compter de 1 à 100; additionner jusqu'à 20. Pour répondre toi-même et garder tes réussites, choisis Pratiquer.</small>`;
  const $=<T extends HTMLElement = HTMLElement>(selector:string)=>parent.querySelector<T>(selector)!;
  const render=()=>{
    $('[data-explorer-count]').hidden=scene.kind!=='count'; $('[data-explorer-add]').hidden=scene.kind!=='add';
    $('[data-explorer-to]').textContent=scene.kind==='count'?String(scene.to):'';
    $('[data-explorer-a]').textContent=scene.kind==='add'?String(scene.a):'';
    $('[data-explorer-b]').textContent=scene.kind==='add'?String(scene.b):'';
    $('[data-explorer-answer]').textContent=revealed?String(kidsAnswer(scene)):'?';
    parent.querySelectorAll<HTMLButtonElement>('[data-explorer-part]').forEach(b=>b.disabled=!!refusal||!kidsStep(scene,b.dataset.explorerPart as KidsPart,Number(b.dataset.delta)).ok);
    parent.querySelectorAll<HTMLButtonElement>('[data-explorer-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.explorerKind===scene.kind)));
    $<HTMLButtonElement>('[data-explorer-reveal]').disabled=!!refusal||revealed;
    $<HTMLButtonElement>('[data-explorer-group]').disabled=!!refusal;
    $('[data-explorer-group]').textContent=regrouped?'Revoir les deux groupes':'Regrouper par dix';
    $('[data-explorer-status]').textContent=refusal?`Pas de dessin : ${refusal}`:kidsLimitNote(scene);
    const total=kidsAnswer(scene);
    $('[data-explorer-description]').textContent=refusal?'Choisis un exemple valide pour reprendre.':scene.kind==='count'?`${Math.floor(total/10)} dizaine(s) et ${total%10} unité(s), soit ${total} objets.`:revealed?`${scene.a} objets A et ${scene.b} objets B font ${total}. Les couleurs restent celles des deux groupes.`:'Compte les objets ou regroupe-les par dix, puis révèle le résultat quand tu veux.';
    const choices=scene.kind==='count'?KIDS_COUNT_PICKS.map(to=>({kind:'count',to} as MathScene)):KIDS_ADD_PICKS.map(([a,b])=>({kind:'add',a,b} as MathScene));
    $('[data-explorer-picks]').replaceChildren(...choices.map(choice=>{const b=document.createElement('button');b.textContent=choice.kind==='count'?String(choice.to):`${choice.a} + ${choice.b}`;b.dataset.explorerPick=kidsHash(choice);b.addEventListener('click',()=>choose(choice));return b;}));
  };
  const choose=(next:MathScene)=>{scene=next;revealed=false;regrouped=false;refusal='';render();changed();};
  parent.querySelectorAll<HTMLButtonElement>('[data-explorer-kind]').forEach(b=>b.addEventListener('click',()=>{const kind=b.dataset.explorerKind as 'count'|'add';if(kind!==scene.kind||refusal)choose(KIDS_START[kind]);}));
  parent.querySelectorAll<HTMLButtonElement>('[data-explorer-part]').forEach(b=>b.addEventListener('click',()=>{const next=kidsStep(scene,b.dataset.explorerPart as KidsPart,Number(b.dataset.delta));if(next.ok)choose(next.scene);}));
  $('[data-explorer-reveal]').addEventListener('click',()=>{revealed=true;render();changed();});
  $('[data-explorer-group]').addEventListener('click',()=>{regrouped=!regrouped;render();changed();});
  const applyHash=(hash:string)=>{const read=kidsFromHash(hash);if(!read)return false;if(read.ok){if(kidsHash(read.scene)!==kidsHash(scene)){revealed=false;regrouped=false;}scene=read.scene;refusal='';}else {refusal=read.say;scene=hash.startsWith('#compter=')?KIDS_START.count:KIDS_START.add;revealed=false;regrouped=false;}render();return true;};
  render();
  return { applyHash, state:()=>({scene,revealed,regrouped}), picture:():ExplorerPicture=>({scene:refusal?null:scene,revealed,regrouped}), hash:()=>refusal?location.hash:kidsHash(scene) };
}
