#!/usr/bin/env node
// Build the spike bundles (spike/world-service/.build). Run from the repository root.
import { build } from "vite";
await build({ configFile: "spike/world-service/vite.config.ts" });
console.log("built spike/world-service/.build");
