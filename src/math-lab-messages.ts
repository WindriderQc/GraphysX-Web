/**
 * Plain French for the Math Lab page's refusals. The block reader answers with AgentX's exact
 * code and English message (they are the parity contract, shown beneath as the detail); this
 * says the same thing simply, for a child or an adult, with an example of what to write.
 * Pure: no DOM.
 */
type Rule = readonly [RegExp, (match: RegExpExecArray) => string];

const NAME = String.raw`"?([a-z])"?`;

/** Specific messages first: they quote the name, the line or the bound at fault. */
const RULES: readonly Rule[] = [
  [/name it f\(x\), g\(x\)…; y cannot be called/, () => "Pour utiliser une fonction dans une autre, appelle-la f(x), g(x)… : y ne peut pas être réutilisé."],
  [new RegExp(String.raw`Unknown name ${NAME}\. Declare a function`), m => `Je ne connais pas « ${m[1]} ». Écris sa fonction, par exemple ${m[1]}(x) = 2x, ou fais-en un paramètre : ${m[1]} = 1 in [-5, 5].`],
  [new RegExp(String.raw`Unknown name ${NAME}`), m => m[1] === "x"
    ? "Une courbe c(t) s'écrit avec t, pas x : c(t) = (cos(t), sin(t))."
    : `Je ne connais pas « ${m[1]} ». Ajoute une ligne pour en faire un paramètre, par exemple : ${m[1]} = 1 in [-5, 5].`],
  [/A curve is written in t/, () => "Une courbe c(t) s'écrit avec t, pas x : c(t) = (cos(t), sin(t))."],
  [/no function named ([a-z]) in this block/, m => `Il n'y a pas de fonction ${m[1]} dans ce bloc.`],
  [/Parameter ([a-z]) needs a slider range/, m => `Le paramètre ${m[1]} a besoin d'un intervalle pour son curseur, par exemple : ${m[1]} = 1 in [-5, 5].`],
  [/Parameter ([a-z]) must lie inside its range/, m => `La valeur de ${m[1]} sort de son intervalle. Choisis une valeur entre le minimum et le maximum.`],
  [/(?:Tangent point|Area start|Area end).*inside the x window|stay inside the x window/, () => "Ce point sort de la fenêtre x. Choisis-le à l'intérieur, ou agrandis la fenêtre x."],
  [/the minimum must be below the maximum/, () => "Dans [min, max], le premier nombre doit être plus petit que le second."],
  [/write the range as \[min, max\]/, () => "Écris l'intervalle entre crochets : [min, max], par exemple [-5, 5]."],
  [/The window is too narrow/, () => "Cette fenêtre est trop étroite pour dessiner. Écarte un peu ses deux bornes."],
  [/must be a finite number/, () => "Ce nombre est trop grand ou mal écrit (un million au plus)."],
  [/Unrecognised line "([^"]*)"/, m => `Je ne comprends pas la ligne « ${m[1]} ». Exemples : y = 2x + 1, a = 1 in [-5, 5], x in [-10, 10].`],
  [/goes with a surface/, () => "« z in […] » va avec une surface z = f(x, y)."],
  [/goes with a curve/, () => "« t in […] » va avec une courbe c(t) = (x(t), y(t))."],
  [/works on functions of x, not on the curve/, () => "Les tangentes, aires et dérivées vont avec les fonctions de x, pas avec les courbes c(t)."],
  [/name the function, for example/, () => "Il y a plusieurs fonctions : dis laquelle, par exemple : tangent f at 1."],
  [/in a circle: (.+)$/, m => `Ces fonctions s'utilisent l'une l'autre en boucle : ${m[1]}.`],
  [/Write ([a-z]'(?:\(x\))?) alone/, m => `Écris seulement ${m[1]} : la dérivée est calculée pour toi.`],
  [/Unsupported character "(.)"/, m => `Le caractère « ${m[1]} » n'est pas permis dans une formule.`],
];

const BY_CODE: Readonly<Record<string, string>> = {
  empty: "La formule est vide.",
  no_function: "Il manque la fonction. Commence par une ligne comme y = 2x + 1.",
  syntax: "La formule est incomplète. Vérifie les parenthèses et qu'il ne manque rien après un signe.",
  character: "Un caractère n'est pas permis dans une formule.",
  unknown_name: "Un nom n'est pas déclaré. Fais-en un paramètre, par exemple : a = 1 in [-5, 5].",
  range: "Un intervalle est mal écrit, ou une valeur en sort.",
  number: "Ce nombre est trop grand ou mal écrit.",
  line: "Je ne comprends pas une ligne. Exemples : y = 2x + 1, a = 1 in [-5, 5], x in [-10, 10].",
  duplicate: "Un même nom est utilisé deux fois. Donne-lui une autre lettre.",
  reserved: "x, y, t, e (et z pour une surface) sont réservés. Choisis une autre lettre.",
  functions: "Quatre fonctions et courbes au plus dans un même dessin.",
  parameters: "Six paramètres au plus.",
  tangents: "Quatre tangentes au plus.",
  areas: "Quatre aires au plus.",
  surfaces: "Deux surfaces au plus.",
  surface: "Une surface z = f(x, y) se dessine seule, avec ses paramètres et ses fenêtres. Mets les autres courbes dans un autre dessin.",
  curve: "Écris la courbe ainsi : c(t) = (x(t), y(t)), deux formules en t séparées par une virgule.",
  derivative: "Écris seulement f'(x) : la dérivée est calculée pour toi.",
  cycle: "Ces fonctions s'utilisent l'une l'autre en boucle.",
  too_long: "C'est trop long. Raccourcis un peu le bloc ou la formule.",
  too_complex: "Cette formule est trop compliquée à dessiner. Simplifie-la un peu.",
};

/** The plain French sentence for a refusal; every code the block reader can return has one. */
export function mathLabRefusal(error: { code: string; message: string }): string {
  // A refusal about one of several functions starts with its name: "g(x): …".
  const owner = /^([a-z](?:\(x(?:, y)?\)|\(t\)(?:, [xy])?)|[yz]): /.exec(error.message);
  const message = owner ? error.message.slice(owner[0].length) : error.message;
  for (const [pattern, say] of RULES) {
    const match = pattern.exec(message);
    if (match) return owner ? `${owner[1]} : ${say(match)}` : say(match);
  }
  const plain = BY_CODE[error.code] ?? "Je ne peux pas dessiner ce bloc.";
  return owner ? `${owner[1]} : ${plain}` : plain;
}

export const MATH_LAB_REFUSAL_CODES = Object.freeze(Object.keys(BY_CODE));

/** Formulas read on screen: integer powers as superscripts (x^2 → x²), products as a centred dot. */
export function prettyMath(expression: string): string {
  const SUPER: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
  return expression
    .replace(/\^(-?\d+)(?![\d.])/g, (_, power: string) => [...power].map(char => SUPER[char]).join(""))
    .replace(/ \* /g, " · ")
    .replace(/ - /g, " − ");
}
