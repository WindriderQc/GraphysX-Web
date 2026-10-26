import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Hash actual source inputs, including uncommitted work. A build must not label dirty
// source with the preceding commit or obtain its identity from a mutable remote release.
export function embedSourceVersion(root) {
  const files = ["package-lock.json", "vite.diskx.config.ts", "scripts/embed-source-version.mjs"];
  const walk = dir => {
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const name = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(name); else files.push(name);
    }
  };
  walk("src");
  const hash = createHash("sha256");
  for (const file of files.sort()) hash.update(file).update("\0").update(readFileSync(path.join(root, file))).update("\0");
  return hash.digest("hex");
}
