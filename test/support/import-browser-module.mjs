import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

const modules = new Map();

/** Resolve transitive browser TS imports too: Node does not resolve extensionless TS edges. */
export function browserModuleUrl(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const source = readFileSync(url, "utf8");
  const { outputText } = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } });
  const executable = outputText.replace(/from (['"])([^'"]+)\1;/g, (_, _quote, specifier) => {
    if (!specifier.startsWith(".")) return `from ${JSON.stringify(import.meta.resolve(specifier))};`;
    const target = new URL(/\.(json|mjs|ts)$/.test(specifier) ? specifier : `${specifier}.ts`, url);
    return `from ${JSON.stringify(target.pathname.endsWith('.ts') ? browserModuleUrl(target) : target.href)}${specifier.endsWith(".json") ? ' with { type: "json" }' : ""};`;
  });
  const resolved = `data:text/javascript;base64,${Buffer.from(executable).toString("base64")}`;
  modules.set(url.href, resolved);
  return resolved;
}

/** Execute the real browser module under Node, resolving its bundler-style import specifiers. */
export async function importBrowserModule(url) {
  return import(browserModuleUrl(url));
}
