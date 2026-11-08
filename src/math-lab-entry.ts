/** The same Math Lab page chooses a level, never a second simultaneous renderer. */
const level=new URLSearchParams(window.location.search).get('level');
const needsNumbers=()=>level==='numbers' || /^#(?:compter|additionner)=/.test(window.location.hash);
const numbers=needsNumbers();
// Hash-only shared links can cross renderer boundaries through Back/Forward as well.
window.addEventListener('hashchange',()=>{if(needsNumbers()!==numbers)window.location.reload();});
if(numbers) {
  document.documentElement.dataset.mathLabLevel='numbers';
  const root=document.createElement('div');root.id='app';document.body.replaceChildren(root);
  void import('./main').catch(()=>{root.textContent='Math Lab ne peut pas démarrer. Recharge la page ou reviens aux courbes et surfaces.';});
} else {
  void import('./math-lab-page');
}
