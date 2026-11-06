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
  | { op: "neg"; args: [MathNode] }
  | { op: "+" | "-" | "*" | "/" | "^"; args: [MathNode, MathNode] };

export type MathFailure = { ok: false; error: { code: string; message: string } };
export type MathParsed = { ok: true; tree: MathNode; names: string[] };

type Token =
  | { type: "number"; value: number }
  | { type: "function" | "constant" | "name"; value: string }
  | { type: "+" | "-" | "*" | "/" | "^" | "(" | ")" | "," | "|"; value?: undefined };

const failure = (code: string, message: string): MathFailure => ({ ok: false, error: { code, message } });

/** Spellings models and people write for the same operators. */
function normalize(source: string): string {
  return String(source).replace(/\*\*/g, "^").replace(/[×·⋅∙]/g, "*").replace(/÷/g, "/").replace(/[−–—]/g, "-")
    .replace(/π/g, "pi").replace(/²/g, "^2").replace(/³/g, "^3");
}

function tokenize(source: string, names: ReadonlySet<string>): { ok: true; tokens: Token[] } | MathFailure {
  const text = normalize(source), tokens: Token[] = [];
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
        else if (names.has(name)) tokens.push({ type: "name", value: name });
        else return failure("unknown_name", `Unknown name "${name}". Declare a parameter on its own line, for example: ${name} = 1 in [-5, 5]`);
        j += name.length;
      }
      i += word.length;
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
// atom       := number | constant | name | function '(' expression ')' | '(' expression ')' | '|' expression '|'
function parseTokens(tokens: readonly Token[]): MathNode {
  let index = 0, nodes = 0;
  const peek = (): Token | undefined => tokens[index];
  const take = (type: Token["type"]): Token | null => (peek() && peek()!.type === type ? tokens[index++] : null);
  const node = <T extends MathNode>(value: T, depth: number): T => {
    nodes += 1;
    if (nodes > MATH_EXPRESSION_LIMITS.nodes || depth > MATH_EXPRESSION_LIMITS.depth) throw new Error("The formula is too complex");
    return value;
  };
  const startsAtom = (token: Token | undefined): boolean => !!token && ["number", "constant", "name", "function", "("].includes(token.type);
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
      // Implicit product: 2x, 3sin(x), (x+1)(x-1), a(x-h). Never across a bar.
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
    if (token.type === "function") {
      if (!take("(")) throw new Error(`Write ${token.value}(…) with parentheses`);
      const arg = expression(depth + 1);
      if (!take(")")) throw new Error("A closing parenthesis is missing");
      return node({ op: "call", name: token.value, args: [arg] }, depth);
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

/** A validated tree for `source`, using only `names` (and pi, e), or a failure. */
export function parseMathExpression(source: unknown, names: readonly string[] = []): MathParsed | MathFailure {
  const text = String(source ?? "").trim();
  if (!text) return failure("empty", "The formula is empty");
  if (text.length > MATH_EXPRESSION_LIMITS.expression) return failure("too_long", "The formula is too long");
  const lexed = tokenize(text, new Set(names));
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

/** The value of a tree for the given names; NaN where it is undefined. */
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
    case "neg": return wrap(`-${formatMath(tree.args[0], PRECEDENCE.neg)}`, PRECEDENCE.neg);
    case "^": return wrap(`${formatMath(tree.args[0], PRECEDENCE["^"] + 1)}^${formatMath(tree.args[1], PRECEDENCE["^"])}`, PRECEDENCE["^"]);
    default: {
      const level = PRECEDENCE[tree.op];
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
