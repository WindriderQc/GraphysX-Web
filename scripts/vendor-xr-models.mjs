// Pinned MIT assets. No package install or runtime CDN requests.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const XR_MODEL_PACKAGE = "@webxr-input-profiles/assets@1.0.20";
export const XR_MODEL_FILES = {
  "generic-hand/left.glb": "bc67783144944ea1cda54d9247885825ea5fb9d4651469fe7d00be517a5c2b87",
  "generic-hand/right.glb": "291790c14f7f88a7f9bd35330c47392ed8e8d395ae6728f4bb7089f1bc1f2b96",
  "oculus-touch-v3/left.glb": "5a3015792dac074b31607e63eeb75743eac479540a36739e5f94b65335a7f88a",
  "oculus-touch-v3/right.glb": "18a2e651328b684d3aeeef9f16c083af1eea9c1f98f78f9da94960432c8a021b",
  "oculus-touch-v3/profile.json": "83e3d226a800fa53044c3c789e5755674b59e6e110bb30d6148bafd5f5821fb4",
  "LICENSE.md": "0ef0c87e8ffdd0681f332dc3b39f284dee2166d1f853fabc3853884fe81a6f30",
};

async function vendor() {
  // Validate every response before changing the vendored set.
  const files = await Promise.all(Object.entries(XR_MODEL_FILES).map(async ([name, hash]) => {
    const source = name === "LICENSE.md" ? name : `dist/profiles/${name}`;
    const response = await fetch(`https://cdn.jsdelivr.net/npm/${XR_MODEL_PACKAGE}/${source}`);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    let bytes = Buffer.from(await response.arrayBuffer());
    const isProfile = name === "oculus-touch-v3/profile.json";
    const sourceHash = isProfile ? "438acabcdb360998d9e8fd97526292f5df5bfc88de9033dabe5817b5d5b29cc8" : hash;
    if (createHash("sha256").update(bytes).digest("hex") !== sourceHash) throw new Error(`${name}: source SHA-256 mismatch`);
    if (isProfile) {
      // Upstream 1.0.20 refers to root/component names absent from its own GLBs,
      // and its left menu animation has no geometry. Keep the input, omit that animation.
      const profile = JSON.parse(bytes.toString());
      for (const layout of Object.values(profile.layouts)) {
        layout.rootNodeName = "root";
        for (const component of Object.values(layout.components)) {
          component.rootNodeName = Object.values(component.visualResponses)[0]?.valueNodeName ?? "controller";
        }
      }
      profile.layouts.left.components.menu.rootNodeName = "controller";
      profile.layouts.left.components.menu.visualResponses = {};
      bytes = Buffer.from(JSON.stringify(profile, null, 2) + "\n");
    }
    if (createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error(`${name}: local SHA-256 mismatch`);
    return [name, bytes];
  }));
  for (const [name, bytes] of files) {
    const target = new URL(`../public/assets/xr/profiles/${name}`, import.meta.url);
    await mkdir(new URL("./", target), { recursive: true });
    await writeFile(target, bytes);
  }
  console.log(`Vendored ${files.length} verified files from ${XR_MODEL_PACKAGE}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await vendor();
