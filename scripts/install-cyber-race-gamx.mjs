#!/usr/bin/env node
// Installs Cyber Race 1992 as a GamX title, following the GamX channel convention
// (see the StarFoX-SNES Playnite notes): an "Atelier" development channel updated after
// each tested build, and a frozen "Validee" (validated edition) channel that only changes
// when the owner explicitly approves a promotion.
//
//   node scripts/install-cyber-race-gamx.mjs --gamx <GamX dir> [--channel Atelier]
//   node scripts/install-cyber-race-gamx.mjs --gamx <GamX dir> --promote   (Atelier -> Validee)
//
// Layout under <GamX dir>/CyberRace1992/:
//   Start-CyberRace.ps1        launcher (verifies the receipt, waits for the window)
//   film/                      optional local film clips, shared by both channels
//   Atelier/  cyber-race.html  channel.json  film -> ../film  profile/
//   Validee/  cyber-race.html  channel.json  film -> ../film  profile/
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const gamx = arg("gamx");
if (!gamx) {
  console.error("usage: --gamx <GamX dir> [--channel Atelier] | --promote");
  process.exit(2);
}
const promote = argv.includes("--promote");
const root = resolve(import.meta.dirname, "..");
const game = join(resolve(gamx), "CyberRace1992");
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

function prepareChannel(channel) {
  const dir = join(game, channel);
  mkdirSync(join(game, "film"), { recursive: true });
  mkdirSync(dir, { recursive: true });
  const link = join(dir, "film");
  // A directory junction needs no administrator rights on Windows.
  if (!existsSync(link)) symlinkSync(join(game, "film"), link, "junction");
  copyFileSync(join(root, "scripts", "gamx", "Start-CyberRace.ps1"), join(game, "Start-CyberRace.ps1"));
  return dir;
}

if (promote) {
  const from = join(game, "Atelier");
  const atelierReceipt = JSON.parse(readFileSync(join(from, "channel.json"), "utf8"));
  const page = join(from, "cyber-race.html");
  if (sha256(page) !== atelierReceipt.sha256) throw new Error("Atelier page does not match its receipt; refusing to promote");
  const dir = prepareChannel("Validee");
  copyFileSync(page, join(dir, "cyber-race.html"));
  const receipt = { ...atelierReceipt, channel: "Validee", promotedAt: new Date().toISOString() };
  writeFileSync(join(dir, "channel.json"), JSON.stringify(receipt, null, 2));
  console.log(`promoted Atelier ${receipt.sha256.slice(0, 12)} to Validee`);
} else {
  const channel = arg("channel") ?? "Atelier";
  if (channel !== "Atelier") throw new Error("only Atelier is installed from a build; Validee is reached by --promote");
  const out = join(root, "output", "cyber-race", "package");
  execFileSync(process.execPath, [join(root, "scripts", "package-cyber-race.mjs"), out], { stdio: "inherit" });
  const dir = prepareChannel(channel);
  copyFileSync(join(out, "cyber-race.html"), join(dir, "cyber-race.html"));
  let commit = "unknown";
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim();
  } catch {
    // Not a git checkout.
  }
  const receipt = {
    channel,
    sha256: sha256(join(dir, "cyber-race.html")),
    sourceCommit: commit,
    builtAt: new Date().toISOString()
  };
  writeFileSync(join(dir, "channel.json"), JSON.stringify(receipt, null, 2));
  console.log(`installed ${channel} ${receipt.sha256.slice(0, 12)} (${commit}) into ${dir}`);
}
