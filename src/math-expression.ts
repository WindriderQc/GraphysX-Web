/**
 * The formula grammar of the Math Lab (AgentX #1270), ported from AgentX's
 * `core/public/js/math-expression.js` so both sides accept and refuse the same formulas.
 * `test/fixtures/math-expression-vectors.json` is a copy of AgentX's vector file; both
 * repositories run it, so a change on one side fails the other until it is mirrored.
 *
 * A tokenizer and a recursive-descent parser build a small tree that is evaluated node by
 * node. Nothing is ever handed to `eval` or `Function`. Pure: no three.js, no DOM.
 */

export const MATH_EXPRESSION_LIMITS = Object.freeze({
  expression: 240, tokens: 160, nodes: 200, depth: 24, parameters: 6, magnitude: 1e6, samples: 480,
  tangents: 4, areas: 4, expanded: 4000, derivative: 20000, integral: 1000, surfaces: 2, grid: 40,
});

const FUNCTIONS: Readonly<Record<string, (value: number) => number>> = Object.freeze({
  sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log, ln: Math.log, sqrt: Math.sqrt, abs: Math.abs,
});
const CONSTANTS: Readonly<Record<string, number>> = Object.freeze({ pi: Math.PI, e: Math.E });
export const MATH_FUNCTION_NAMES = Object.freeze(Object.keys(FUNCTIONS));
/** x is the variable; y and t are reserved for surfaces and parametric curves, e is the constant. */
export const MATH_RESERVED_NAMES = Object.freeze(["x", "y", "t", "e"]);
const WORDS = [...Object.keys(FUNCTIONS), "pi"].sort((a, b) => b.length - a.length);

export type MathNode =
  | { op: "number"; value: number }
  | { op: "constant" | "name"; name: string }
  | { op: "call"; name: string; args: [MathNode] }
  /** Another function of the same block, f(…) or its derivative f'(…); see {@link parseMathFunctions}. */
  | { op: "apply"; name: string; prime?: true; args: [MathNode] }
  | { op: "neg"; args: [MathNode] }
  | { op: "+" | "-" | "*" | "/" | "^"; args: [MathNode, MathNode] };

export type MathFailure = { ok: false; error: { code: string; message: string } };
export type MathParsed = { ok: true; tree: MathNode; names: string[] };

type Token =
  | { type: "number"; value: number }
  | { type: "function" | "constant" | "name"; value: string }
  | { type: "userfn"; value: string; prime: boolean }
  | { type: "+" | "-" | "*" | "/" | "^" | "(" | ")" | "," | "|"; value?: undefined };

const failure = (code: string, message: string): MathFailure => ({ ok: false, error: { code, message } });

/** Spellings models and people write for the same operators. */
export function normalizeMath(source: string): string {
  return String(source).replace(/\*\*/g, "^").replace(/[×·⋅∙]/g, "*").replace(/÷/g, "/").replace(/[−–—]/g, "-")
    .replace(/π/g, "pi").replace(/²/g, "^2").replace(/³/g, "^3").replace(/[′’]/g, "'");
}

/** `callables` are the block's functions: f(…) and f'(…) use them, never a product. */
function tokenize(source: string, names: ReadonlySet<string>, callables: ReadonlySet<string> = new Set()):
  { ok: true; tokens: Token[] } | MathFailure {
  const text = normalizeMath(source), tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (/\s/.test(char)) { i += 1; continue; }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    // "2e" is two times e, not an unfinished exponent; the pattern requires digits after e.
    if (number) { tokens.push({ type: "number", value: Number(number[0]) }); i += number[0].length; }
    else if (/[a-z]/i.test(char)) {
      const word = /^[a-z]+/i.exec(text.slice(i))![0].toLowerCase();
      // Known words first (sin, sqrt, pi…), then single-letter names: "ax" is a·x.
      let j = 0;
      while (j < word.length) {
        const rest = word.slice(j);
        const name = WORDS.find(known => rest.startsWith(known)) || rest[0];
        if (Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) tokens.push({ type: "function", value: name });
        else if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) tokens.push({ type: "constant", value: name });
        else if (callables.has(name)) tokens.push({ type: "userfn", value: name, prime: false });
        else if (names.has(name)) tokens.push({ type: "name", value: name });
        // h(x) with no h declared: it may be meant as a function or as a parameter times (x).
        else if (j + 1 === word.length && /^\s*\(/.test(text.slice(i + word.length))) {
          return failure("unknown_name", `Unknown name "${name}". Declare a function ${name}(x) = … or a parameter ${name} = 1 in [-5, 5] on its own line`);
        } else return failure("unknown_name", `Unknown name "${name}". Declare a parameter on its own line, for example: ${name} = 1 in [-5, 5]`);
        j += name.length;
      }
      i += word.length;
    } else if (char === "'" && tokens.length && tokens[tokens.length - 1].type === "userfn" && !(tokens[tokens.length - 1] as { prime: boolean }).prime) {
      (tokens[tokens.length - 1] as { prime: boolean }).prime = true;
      i += 1;
    } else if ("+-*/^(),|".includes(char)) { tokens.push({ type: char as "+" }); i += 1; }
    else return failure("character", `Unsupported character "${char}"`);
    if (tokens.length > MATH_EXPRESSION_LIMITS.tokens) return failure("too_long", "The formula is too long");
  }
  return { ok: true, tokens };
}

// expression := term (('+'|'-') term)*
// term       := unary (('*'|'/'|implicit) unary)*
// unary      := ('+'|'-') unary | power
// power      := atom ('^' unary)?          (right-associative; -x^2 is -(x^2))
// atom       := number | constant | name | function '(' expression ')' | userfn ['''] '(' expression ')'
//             | '(' expression ')' | '|' expression '|'
function parseTokens(tokens: readonly Token[]): MathNode {
  let index = 0, nodes = 0;
  const peek = (): Token | undefined => tokens[index];
  const take = (type: Token["type"]): Token | null => (peek() && peek()!.type === type ? tokens[index++] : null);
  const node = <T extends MathNode>(value: T, depth: number): T => {
    nodes += 1;
    if (nodes > MATH_EXPRESSION_LIMITS.nodes || depth > MATH_EXPRESSION_LIMITS.depth) throw new Error("The formula is too complex");
    return value;
  };
  const startsAtom = (token: Token | undefined): boolean => !!token && ["number", "constant", "name", "function", "userfn", "("].includes(token.type);
  function expression(depth: number): MathNode {
    let left = term(depth + 1);
    for (let op = take("+") || take("-"); op; op = take("+") || take("-")) {
      left = node({ op: op.type as "+" | "-", args: [left, term(depth + 1)] }, depth);
    }
    return left;
  }
  function term(depth: number): MathNode {
    let left = unary(depth + 1);
    for (;;) {
      const op = take("*") || take("/");
      if (op) { left = node({ op: op.type as "*" | "/", args: [left, unary(depth + 1)] }, depth); continue; }
      // Implicit product: 2x, 3sin(x), (x+1)(x-1), a(x-h), 2f(x). Never across a bar.
      if (startsAtom(peek())) { left = node({ op: "*", args: [left, power(depth + 1)] }, depth); continue; }
      return left;
    }
  }
  function unary(depth: number): MathNode {
    const op = take("-") || take("+");
    if (!op) return power(depth);
    const value = unary(depth + 1);
    return op.type === "-" ? node({ op: "neg", args: [value] }, depth) : value;
  }
  function power(depth: number): MathNode {
    const base = atom(depth + 1);
    return take("^") ? node({ op: "^", args: [base, unary(depth + 1)] }, depth) : base;
  }
  function atom(depth: number): MathNode {
    const token = tokens[index++];
    if (!token) throw new Error("The formula ends too early");
    if (token.type === "number") return node({ op: "number", value: token.value }, depth);
    if (token.type === "constant") return node({ op: "constant", name: token.value }, depth);
    if (token.type === "name") return node({ op: "name", name: token.value }, depth);
    if (token.type === "function" || token.type === "userfn") {
      const prime = token.type === "userfn" && token.prime;
      if (!take("(")) throw new Error(`Write ${token.value}${prime ? "'" : ""}(…) with parentheses`);
      const arg = expression(depth + 1);
      if (!take(")")) throw new Error("A closing parenthesis is missing");
      if (token.type === "function") return node({ op: "call", name: token.value, args: [arg] }, depth);
      return node(prime ? { op: "apply", name: token.value, prime: true, args: [arg] } : { op: "apply", name: token.value, args: [arg] }, depth);
    }
    if (token.type === "(") {
      const inner = expression(depth + 1);
      if (!take(")")) throw new Error("A closing parenthesis is missing");
      return inner;
    }
    if (token.type === "|") {
      const inner = expression(depth + 1);
      if (!take("|")) throw new Error("A closing | is missing");
      return node({ op: "call", name: "abs", args: [inner] }, depth);
    }
    throw new Error(`Unexpected "${token.type}"`);
  }
  const tree = expression(0);
  if (index < tokens.length) {
    const extra = tokens[index];
    throw new Error(`Unexpected "${extra.value ?? extra.type}"`);
  }
  return tree;
}

/** A validated tree for `source`, using only `names` (and pi, e) and the block's `functions`, or a failure. */
export function parseMathExpression(source: unknown, names: readonly string[] = [], functions: readonly string[] = []):
  MathParsed | MathFailure {
  const text = String(source ?? "").trim();
  if (!text) return failure("empty", "The formula is empty");
  if (text.length > MATH_EXPRESSION_LIMITS.expression) return failure("too_long", "The formula is too long");
  const lexed = tokenize(text, new Set(names), new Set(functions));
  if (!lexed.ok) return lexed;
  try {
    const tree = parseTokens(lexed.tokens);
    return { ok: true, tree, names: Array.from(usedNames(tree)) };
  } catch (error) {
    return failure("syntax", (error as Error).message);
  }
}

function usedNames(tree: MathNode, found = new Set<string>()): Set<string> {
  if (tree.op === "name") found.add(tree.name);
  if ("args" in tree) tree.args.forEach(arg => usedNames(arg, found));
  return found;
}

/** The value of a tree for the given names; NaN where it is undefined (or still names another function). */
export function evaluateMath(tree: MathNode, scope: Readonly<Record<string, number>> = {}): number {
  switch (tree.op) {
    case "number": return tree.value;
    case "constant": return CONSTANTS[tree.name];
    case "name": return Object.prototype.hasOwnProperty.call(scope, tree.name) ? Number(scope[tree.name]) : NaN;
    case "neg": return -evaluateMath(tree.args[0], scope);
    case "call": return FUNCTIONS[tree.name](evaluateMath(tree.args[0], scope));
    case "+": return evaluateMath(tree.args[0], scope) + evaluateMath(tree.args[1], scope);
    case "-": return evaluateMath(tree.args[0], scope) - evaluateMath(tree.args[1], scope);
    case "*": return evaluateMath(tree.args[0], scope) * evaluateMath(tree.args[1], scope);
    case "/": return evaluateMath(tree.args[0], scope) / evaluateMath(tree.args[1], scope);
    case "^": return Math.pow(evaluateMath(tree.args[0], scope), evaluateMath(tree.args[1], scope));
    default: return NaN;
  }
}

const PRECEDENCE: Readonly<Record<string, number>> = { "+": 1, "-": 1, "*": 2, "/": 2, neg: 3, "^": 4 };

/** Readable canonical text: explicit operators, minimal parentheses. */
export function formatMath(tree: MathNode, parent = 0, right = false): string {
  const wrap = (text: string, level: number): string =>
    (level < parent || (right && level === parent && level !== 4) ? `(${text})` : text);
  switch (tree.op) {
    case "number": return formatMathNumber(tree.value);
    case "constant": case "name": return tree.name;
    case "call": return `${tree.name}(${formatMath(tree.args[0])})`;
    case "apply": return `${tree.name}${tree.prime ? "'" : ""}(${formatMath(tree.args[0])})`;
    case "neg": return wrap(`-${formatMath(tree.args[0], PRECEDENCE.neg)}`, PRECEDENCE.neg);
    case "^": return wrap(`${formatMath(tree.args[0], PRECEDENCE["^"] + 1)}^${formatMath(tree.args[1], PRECEDENCE["^"])}`, PRECEDENCE["^"]);
    default: {
      const level = PRECEDENCE[tree.op as string];
      return wrap(`${formatMath(tree.args[0], level)} ${tree.op} ${formatMath(tree.args[1], level, true)}`, level);
    }
  }
}

/** Ten significant digits: 0.1 + 0.2 reads 0.3, a tiny coefficient is kept. */
export function formatMathNumber(value: number): string {
  if (!Number.isFinite(value)) return "NaN";
  const rounded = Number(value.toPrecision(10));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Points computed from the formula over `[x0, x1]`: y is null where undefined or off any chart. */
export function sampleMath(tree: MathNode, window: readonly [number, number], scope: Readonly<Record<string, number>>,
  count: number = MATH_EXPRESSION_LIMITS.samples): [number, number | null][] {
  const values: Record<string, number> = { ...scope };
  const [x0, x1] = window, points: [number, number | null][] = [];
  for (let i = 0; i <= count; i += 1) {
    const x = x0 + (x1 - x0) * i / count;
    values.x = x;
    const y = evaluateMath(tree, values);
    points.push([x, Number.isFinite(y) && Math.abs(y) < 1e12 ? y : null]);
  }
  return points;
}

/** The vertical window: the declared one, else fitted to the curves without chasing asymptotes. */
export function fitMathY(points: readonly (readonly [number, number | null])[], declared?: readonly [number, number] | null): [number, number] {
  if (declared) return [declared[0], declared[1]];
  const ys = points.map(point => point[1]).filter((y): y is number => y !== null).sort((a, b) => a - b);
  if (!ys.length) return [-10, 10];
  const at = (q: number): number => ys[Math.min(ys.length - 1, Math.max(0, Math.round(q * (ys.length - 1))))];
  let low = at(0.02), high = at(0.98);
  if (ys.length < 20) { low = ys[0]; high = ys[ys.length - 1]; }
  if (high - low < 1e-9) { low -= 1; high += 1; }
  const pad = (high - low) * 0.1;
  return [low - pad, high + pad];
}

/**
 * A window around every value (parametric coordinates, surface heights), so a narrow peak is never
 * cut off; only when a few values run far away (an asymptote) does it keep the middle 96% instead.
 * A little room is added on both sides. The same rule as AgentX's `fitRange`.
 */
export function fitMathRange(values: readonly (number | null)[]): [number, number] {
  const sorted = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return [-10, 10];
  let low = sorted[0], high = sorted[sorted.length - 1];
  if (sorted.length >= 20) {
    const at = (q: number): number => sorted[Math.round(q * (sorted.length - 1))];
    const middle = at(0.98) - at(0.02);
    if (middle > 1e-9 && high - low > middle * 10) { low = at(0.02); high = at(0.98); }
  }
  if (high - low < 1e-9) { low -= 1; high += 1; }
  const pad = (high - low) * 0.08;
  return [low - pad, high + pad];
}

// ---------------------------------------------------------------------------------------------
// Derivatives (phase 3): d/dx of a validated tree by the usual rules, simplified enough to read.
// The same rules, in the same order, as AgentX's `derive`, so both write the same derivative.

type Binary = "+" | "-" | "*" | "/" | "^";
/** A negative number is written as a negation, as the parser reads "-2". */
const num = (value: number): MathNode =>
  (value < 0 ? { op: "neg", args: [{ op: "number", value: -value }] } : { op: "number", value: value === 0 ? 0 : value });
const valueOf = (tree: MathNode): number | null =>
  (tree.op === "number" ? tree.value : tree.op === "neg" && tree.args[0].op === "number" ? -tree.args[0].value : null);
const hasX = (tree: MathNode): boolean => (tree.op === "name" ? tree.name === "x" : "args" in tree && tree.args.some(hasX));
/** Only numbers and operators: its value is known exactly enough to fold. */
const numeric = (tree: MathNode): boolean => tree.op === "number"
  || (tree.op !== "call" && tree.op !== "apply" && "args" in tree && (tree.args as MathNode[]).every(numeric));
const small = (value: number): boolean => Number.isInteger(value) && Math.abs(value) <= MATH_EXPRESSION_LIMITS.magnitude;
const pair = (tree: MathNode): [MathNode, MathNode] => (tree as { args: [MathNode, MathNode] }).args;

/** The positive form of a term that reads with a leading minus, or null. */
function negated(tree: MathNode): MathNode | null {
  if (tree.op === "neg") return tree.args[0];
  if ((tree.op === "*" || tree.op === "/") && negated(tree.args[0])) return make(tree.op, negated(tree.args[0])!, tree.args[1]);
  return null;
}
function negate(tree: MathNode): MathNode {
  const value = valueOf(tree);
  if (value !== null) return num(-value);
  if (tree.op === "neg") return tree.args[0];
  if (tree.op === "*" || tree.op === "/") return make(tree.op, negate(tree.args[0]), tree.args[1]);
  if (tree.op === "-") return make("-", tree.args[1], tree.args[0]);
  return { op: "neg", args: [tree] };
}
/** A node with the obvious simplifications: 0 + u, 1 * u, u^1, folded numbers, constants first. */
function make(op: Binary, a: MathNode, b: MathNode): MathNode {
  const va = valueOf(a), vb = valueOf(b);
  switch (op) {
    case "+":
      if (va === 0) return b;
      if (vb === 0) return a;
      if (va !== null && vb !== null) return num(va + vb);
      if (negated(b)) return make("-", a, negated(b)!);
      return { op, args: [a, b] };
    case "-":
      if (vb === 0) return a;
      if (va === 0) return negate(b);
      if (va !== null && vb !== null) return num(va - vb);
      if (negated(b)) return make("+", a, negated(b)!);
      return { op, args: [a, b] };
    case "*":
      if (va === 0 || vb === 0) return num(0);
      if (va === 1) return b;
      if (vb === 1) return a;
      if (va === -1) return negate(b);
      if (vb === -1) return negate(a);
      if (va !== null && vb !== null) return num(va * vb);
      if (vb !== null) return make("*", b, a);
      if (b.op === "neg") return negate(make("*", a, b.args[0]));
      if (b.op === "*") return make("*", make("*", a, b.args[0]), b.args[1]);
      return { op, args: [a, b] };
    case "/": {
      if (va === 0) return num(0);
      if (vb === 1) return a;
      if (va !== null && vb !== null && vb !== 0 && small(va / vb)) return num(va / vb);
      // (3 * x^2) / 3 → x^2: a whole coefficient divides out.
      const coefficient = a.op === "*" ? valueOf(a.args[0]) : null;
      if (vb !== null && vb !== 0 && coefficient !== null && small(coefficient / vb)) return make("*", num(coefficient / vb), pair(a)[1]);
      return { op, args: [a, b] };
    }
    default:
      if (vb === 0) return num(1);
      if (vb === 1) return a;
      if (va !== null && vb !== null && small(Math.pow(va, vb))) return num(Math.pow(va, vb));
      return { op, args: [a, b] };
  }
}
const call = (name: string, arg: MathNode): MathNode => ({ op: "call", name, args: [arg] });

/** d/dx of a tree without references to other functions (see {@link parseMathFunctions}). */
export function deriveMath(tree: MathNode): MathNode {
  switch (tree.op) {
    case "number": case "constant": return num(0);
    case "name": return num(tree.name === "x" ? 1 : 0);
    case "neg": return negate(deriveMath(tree.args[0]));
    case "+": case "-": return make(tree.op, deriveMath(tree.args[0]), deriveMath(tree.args[1]));
    case "*": {
      const [u, v] = tree.args;
      if (!hasX(u)) return make("*", u, deriveMath(v));
      if (!hasX(v)) return make("*", v, deriveMath(u));
      return make("+", make("*", deriveMath(u), v), make("*", u, deriveMath(v)));
    }
    case "/": {
      const [u, v] = tree.args;
      if (!hasX(v)) return make("/", deriveMath(u), v);
      return make("/", make("-", make("*", deriveMath(u), v), make("*", u, deriveMath(v))), make("^", v, num(2)));
    }
    case "^": {
      const [u, v] = tree.args;
      if (!hasX(v)) {
        // Power rule; a plain number exponent gets its n - 1 folded: x^3 → 3 * x^2.
        const n = numeric(v) ? num(evaluateMath(v)) : v, less = numeric(v) ? num(evaluateMath(v) - 1) : make("-", v, num(1));
        return make("*", deriveMath(u), make("*", n, make("^", u, less)));
      }
      if (!hasX(u)) {
        // a^v: e^v needs no ln(e).
        const grown = u.op === "constant" && u.name === "e" ? tree : make("*", tree, call("ln", u));
        return make("*", deriveMath(v), grown);
      }
      return make("*", tree, make("+", make("*", deriveMath(v), call("ln", u)), make("/", make("*", v, deriveMath(u)), u)));
    }
    case "call": {
      const u = tree.args[0], du = deriveMath(u);
      switch (tree.name) {
        case "sin": return make("*", du, call("cos", u));
        case "cos": return negate(make("*", du, call("sin", u)));
        case "tan": return make("/", du, make("^", call("cos", u), num(2)));
        case "exp": return make("*", du, tree);
        case "log": case "ln": return make("/", du, u);
        case "sqrt": return make("/", du, make("*", num(2), tree));
        // Undefined where u = 0, as the corner of |u| is.
        default: return make("*", du, make("/", u, tree));
      }
    }
    default: return num(NaN);
  }
}

/** How many nodes evaluating a tree visits, shared subtrees counted each time they are reached. */
export function mathWeight(tree: MathNode, memo: WeakMap<MathNode, number> = new WeakMap()): number {
  const known = memo.get(tree);
  if (known !== undefined) return known;
  const total = 1 + ("args" in tree ? (tree.args as MathNode[]).reduce((sum, arg) => sum + mathWeight(arg, memo), 0) : 0);
  memo.set(tree, total);
  return total;
}

/** The tree with x replaced by `arg` (shared, not copied). */
function substitute(tree: MathNode, arg: MathNode): MathNode {
  if (tree.op === "name") return tree.name === "x" ? arg : tree;
  return "args" in tree ? { ...tree, args: (tree.args as MathNode[]).map(child => substitute(child, arg)) } as MathNode : tree;
}

export type MathFunctionSource = Readonly<{ name: string; source: unknown }>;
export type MathFunctionTrees = Readonly<{ name: string; tree: MathNode; expanded: MathNode }>;

class MathStop extends Error {
  constructor(readonly code: string, message: string, readonly fn: string) { super(message); }
}

/**
 * Functions that may use one another: f(x) = x^2, g(x) = f(x - 1) + f'(x).
 * Each `tree` keeps its references, for display; `expanded` replaces them by the function's own
 * formula (a derivative reference by its derivative), so nothing follows a name while drawing.
 * A function that reaches itself through references is refused. The failure names the function.
 */
export function parseMathFunctions(rows: readonly MathFunctionSource[], names: readonly string[]):
  { ok: true; functions: MathFunctionTrees[] } | (MathFailure & { name: string }) {
  const callable = rows.filter(row => row.name !== "y").map(row => row.name);
  const parsed = new Map<string, MathNode>();
  for (const row of rows) {
    const result = parseMathExpression(row.source, names, callable);
    if (!result.ok) return { ...result, name: row.name };
    parsed.set(row.name, result.tree);
  }
  const expanded = new Map<string, MathNode>(), visiting: string[] = [], memo = new WeakMap<MathNode, number>();
  const expand = (name: string): MathNode => {
    const known = expanded.get(name);
    if (known) return known;
    if (visiting.includes(name)) {
      const loop = [...visiting.slice(visiting.indexOf(name)), name].map(row => `${row}(x)`).join(" → ");
      throw new MathStop("cycle", `Functions cannot use each other in a circle: ${loop}`, visiting[visiting.length - 1]);
    }
    visiting.push(name);
    const tree = inline(parsed.get(name)!, name);
    visiting.pop();
    expanded.set(name, tree);
    return tree;
  };
  const inline = (tree: MathNode, owner: string): MathNode => {
    let result: MathNode;
    if (tree.op === "apply") {
      let body = expand(tree.name);
      if (tree.prime) {
        body = deriveMath(body);
        if (mathWeight(body, memo) > MATH_EXPRESSION_LIMITS.derivative) {
          throw new MathStop("too_complex", `The derivative of ${tree.name}(x) is too large to use`, owner);
        }
      }
      result = substitute(body, inline(tree.args[0], owner));
    } else result = "args" in tree ? { ...tree, args: (tree.args as MathNode[]).map(child => inline(child, owner)) } as MathNode : tree;
    // Checked as it grows, so f(f(f(x))) chains stop before they get large.
    if (mathWeight(result, memo) > MATH_EXPRESSION_LIMITS.expanded) {
      throw new MathStop("too_complex", "Using the other functions makes this formula too large to draw", owner);
    }
    return result;
  };
  try {
    for (const row of rows) expand(row.name);
  } catch (error) {
    if (!(error instanceof MathStop)) throw error;
    return { ...failure(error.code, error.message), name: error.fn };
  }
  return { ok: true, functions: rows.map(row => ({ name: row.name, tree: parsed.get(row.name)!, expanded: expanded.get(row.name)! })) };
}

/**
 * `tree` with its references to the scene's functions replaced by their formulas, as
 * {@link parseMathFunctions} does for a function: a parametric curve's coordinates may use f(t)
 * or f'(t). `functions` are that function's rows. The same rule as AgentX's `expandCalls`.
 */
export function expandMathCalls(tree: MathNode, functions: readonly MathFunctionTrees[]): { ok: true; tree: MathNode } | MathFailure {
  const bodies = new Map(functions.map(row => [row.name, row.expanded])), slopes = new Map<string, MathNode>();
  const memo = new WeakMap<MathNode, number>();
  const inline = (node: MathNode): MathNode => {
    let result: MathNode;
    if (node.op === "apply") {
      let body = bodies.get(node.name);
      if (!body) throw new MathStop("unknown_name", `Unknown function ${node.name}`, node.name);
      if (node.prime) {
        if (!slopes.has(node.name)) {
          const slope = deriveMath(body);
          if (mathWeight(slope, memo) > MATH_EXPRESSION_LIMITS.derivative) {
            throw new MathStop("too_complex", `The derivative of ${node.name}(x) is too large to use`, node.name);
          }
          slopes.set(node.name, slope);
        }
        body = slopes.get(node.name)!;
      }
      result = substitute(body, inline(node.args[0]));
    } else result = "args" in node ? { ...node, args: (node.args as MathNode[]).map(inline) } as MathNode : node;
    if (mathWeight(result, memo) > MATH_EXPRESSION_LIMITS.expanded) {
      throw new MathStop("too_complex", "Using the other functions makes this formula too large to draw", "");
    }
    return result;
  };
  try {
    return { ok: true, tree: inline(tree) };
  } catch (error) {
    if (!(error instanceof MathStop)) throw error;
    return failure(error.code, error.message);
  }
}

/**
 * The signed area under a curve between two x values (Simpson's rule on the formula, as AgentX
 * computes it), or null when the formula is undefined anywhere in between.
 */
export function integrateMath(tree: MathNode, scope: Readonly<Record<string, number>>, from: number, to: number,
  steps: number = MATH_EXPRESSION_LIMITS.integral): number | null {
  if (from === to) return 0;
  const h = (to - from) / steps;
  let sum = 0;
  for (let i = 0; i <= steps; i += 1) {
    const y = evaluateMath(tree, { ...scope, x: from + h * i });
    if (!Number.isFinite(y)) return null;
    sum += y * (i === 0 || i === steps ? 1 : i % 2 ? 4 : 2);
  }
  const value = sum * h / 3;
  return Number.isFinite(value) && Math.abs(value) < 1e12 ? value : null;
}
