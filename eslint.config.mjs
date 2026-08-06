// A deliberately small lint config, and it should stay small.
//
// `tsc --strict` with `noUnusedLocals` and `noUnusedParameters` already carries most of the
// static-analysis load here, and this project's code is consistent without a style enforcer.
// Adding a wall of stylistic rules to a 79k-line codebase produces a red baseline that gets
// suppressed rather than fixed, and teaches everyone to ignore the linter.
//
// So this covers exactly what the type checker cannot see: the promise rules. They need type
// information, which is why they cannot live in tsconfig, and they catch a class of bug that
// is invisible until production — an async call whose rejection nobody is waiting for
// disappears into an unhandled rejection, and an async function handed to something expecting
// `void` returns a promise the caller silently drops.
//
// `void expr` is the intended escape hatch for a promise that is genuinely fire-and-forget,
// and this codebase already uses it that way in dozens of places.
//
// Growing this file is fine. Growing it with rules nobody has agreed to fix is not.

import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "public/**",
      "output/**",
      "node_modules/**",
      ".graphysx-store/**",
      "patches/**",
      // Recovered archive data, not source.
      "src/legacy/**/*.json",
    ],
  },

  // The product and its legacy neighbour. Type-aware, because the rules below need types.
  {
    files: ["src/**/*.ts"],
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-for-in-array": "error",
      "no-unsafe-finally": "error",
      // `no-misused-promises` is deliberately NOT enabled with `checksVoidReturn`.
      //
      // Its only findings here were six `element.addEventListener("click", async () => ...)`
      // handlers, every one of which already try/catches its own awaits. The symptom the rule
      // guards — a rejection escaping into an unhandled rejection — is something this project
      // already fails on: every browser smoke asserts zero console and page errors, so an
      // unhandled rejection turns the gate red on the spot, with a stack, in the route where
      // it happened. Rewriting six correct handlers into `() => void (async () => {…})()` to
      // satisfy a rule whose failure mode is already covered is churn, not safety.
      //
      // `no-floating-promises` above is the half that earns its place: it found two real
      // `.then()` chains with no rejection handler at all.
      "@typescript-eslint/no-misused-promises": "off",
    },
  },

  // The server, the harness and the tooling. No TypeScript project covers these — tsconfig
  // deliberately includes only `src` — so they get the syntax-level rules only.
  {
    files: ["server/**/*.mjs", "scripts/**/*.mjs", "tools/**/*.mjs", "test/**/*.mjs", "*.mjs"],
    languageOptions: {
      // `latest`, not a pinned year: the vendor scripts use import attributes
      // (`with { type: "json" }`), which a 2023 parser rejects outright as a syntax error.
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unsafe-finally": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-dupe-class-members": "error",
      "no-duplicate-case": "error",
      "no-self-compare": "error",
      "no-constant-binary-expression": "error",
      // `require-atomic-updates` is deliberately NOT enabled. It reported six sites, and all
      // six are assignments that follow an `await` inside a section this code serialises on
      // purpose — the live session's own task chain, the asset store's manifest queue, a
      // test's monotonic clock. The rule cannot see an explicit serialisation point, so its
      // findings here are exactly the ones a reader would have to dismiss one by one, and a
      // rule whose output is dismissed six times out of six is a rule nobody reads.
    },
  },
);
