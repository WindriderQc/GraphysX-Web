/**
 * The Math Lab page's starter blocks, from simple to advanced. Each is written exactly as Nestor
 * writes a `<show kind="math">` block in AgentX, so a person can copy one there and back.
 * The parity vectors include every one of them (scripts/math-block-vectors.mjs).
 */
export type MathLabExample = Readonly<{ id: string; label: string; hint: string; body: string }>;

export const MATH_LAB_EXAMPLES: readonly MathLabExample[] = Object.freeze([
  { id: "line", label: "Une droite", hint: "y = m x + b : m penche la droite, b la monte ou la descend.",
    body: "y = m x + b\nm = 1 in [-3, 3]\nb = 0 in [-5, 5]\nx in [-5, 5]" },
  { id: "parabola", label: "Une parabole", hint: "a ouvre ou ferme le bol, c le déplace en hauteur.",
    body: "y = a x^2 + b x + c\na = 1 in [-2, 2]\nb = 0 in [-4, 4]\nc = -2 in [-5, 5]\nx in [-4, 4]" },
  { id: "compare", label: "Deux courbes", hint: "f et g sur les mêmes axes : où se croisent-elles ?",
    body: "f(x) = x^2\ng(x) = a x + 1\na = 2 in [-3, 3]\nx in [-3, 3]" },
  { id: "wave", label: "Une vague", hint: "a règle la hauteur de la vague, b sa vitesse.",
    body: "y = a sin(b x)\na = 1 in [-3, 3]\nb = 2 in [0.5, 4]\nx in [-2pi, 2pi]" },
  { id: "tangent", label: "Une tangente", hint: "f'(x) est la pente de f ; la tangente touche f au point p.",
    body: "f(x) = x^3 - 3x\nf'(x)\ntangent f at p\np = 1 in [-2, 2]\nx in [-2.5, 2.5]" },
  { id: "area", label: "Une aire", hint: "L'aire sous sin(x) entre 0 et b : elle vaut 2 quand b = pi.",
    body: "f(x) = sin(x)\narea f from 0 to b\nb = 2 in [0, 6]\nx in [-1, 7]" },
  { id: "circle", label: "Un cercle c(t)", hint: "Une courbe paramétrée : x = r cos(t), y = r sin(t).",
    body: "c(t) = (r cos(t), r sin(t))\nr = 2 in [0.5, 3]" },
  { id: "hill", label: "Une colline", hint: "Une surface z = f(x, y) : h règle la hauteur, s la largeur.",
    body: "z = h exp(-(x^2 + y^2) / s)\nh = 3 in [0.5, 5]\ns = 4 in [1, 10]\nx in [-5, 5]\ny in [-5, 5]" },
  { id: "saddle", label: "Une selle", hint: "Deux surfaces : la selle z = x² - y² et un plan qui la coupe.",
    body: "f(x, y) = x^2 - y^2\ng(x, y) = k\nk = 0 in [-3, 3]\nx in [-2, 2]\ny in [-2, 2]" },
]);
