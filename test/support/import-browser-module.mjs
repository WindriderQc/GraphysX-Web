import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

/** Execute the real browser module under Node, resolving its bundler-style import specifiers. */
export async function importBrowserModule(url) {
  const source = readFileSync(url, "utf8");
  const { outputText } = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } });
  const executable = outputText.replace(/from "([^"]+)";/g, (_, specifier) => {
    if (!specifier.startsWith(".")) return `from ${JSON.stringify(import.meta.resolve(specifier))};`;
    const target = new URL(/\.(json|mjs)$/.test(specifier) ? specifier : `${specifier}.ts`, url).href;
    return `from ${JSON.stringify(target)}${specifier.endsWith(".json") ? ' with { type: "json" }' : ""};`;
  });
  return import(`data:text/javascript;base64,${Buffer.from(executable).toString("base64")}`);
}
