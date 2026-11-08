/** One Math Lab identity and level switch, shared by both renderer adapters. */
import './math-lab-navigation.css';
export type MathLabLevel = 'numbers' | 'functions';
export function mountMathLabLevels(parent: HTMLElement, level: MathLabLevel, fragment: () => string = () => window.location.hash): HTMLElement {
  const nav=document.createElement('nav');nav.className='math-lab-levels';nav.setAttribute('aria-label','Niveaux de Math Lab');
  const advancedKey='graphysx.math-lab.advanced-fragment.v1';
  const destinationHash=(target: MathLabLevel) => {
    const current=fragment();
    if(current.startsWith('#bloc=')) {
      try { sessionStorage.setItem(advancedKey,current); } catch { /* Links still work without storage. */ }
      return current;
    }
    if(target==='numbers') return current;
    try { return sessionStorage.getItem(advancedKey) || ''; } catch { return ''; }
  };
  for(const [id,label,description] of [
    ['numbers','Nombres et calculs','Compter, additionner, compl\u00e9ter et soustraire'],
    ['functions','Courbes et surfaces','Fonctions, tangentes, aires et 3D'],
  ] as const) {
    const link=document.createElement('a');link.href=import.meta.env.BASE_URL+'math-lab.html?level='+id+destinationHash(id);link.dataset.mathLevel=id;
    const update=()=>{link.href=import.meta.env.BASE_URL+'math-lab.html?level='+id+destinationHash(id);};
    for(const event of ['pointerdown','pointerenter','focus','contextmenu','click'])link.addEventListener(event,update);
    if(id===level)link.setAttribute('aria-current','page');
    const title=document.createElement('strong');title.textContent=label;
    const subtitle=document.createElement('small');subtitle.textContent=description;
    link.append(title,subtitle);nav.append(link);
  }
  parent.append(nav);return nav;
}
