#!/usr/bin/env node
// Cuts Cyber Race's optional film clips from YOUR OWN copy of The Lawnmower Man (1992,
// director's cut timings) into a `film/` folder next to a packaged cyber-race.html.
// The clips are personal-use material: never commit them or publish them with the site.
//
// Usage:
//   node scripts/extract-cyber-race-film.mjs --movie <film.mp4> --out <package dir> [--ffmpeg <ffmpeg.exe>]
//
// Timings were checked frame by frame against the director's cut (see docs/CYBER_RACE.md).
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, i, all) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), all[i + 1]]);
    return pairs;
  }, [])
);
if (!args.movie || !args.out) {
  console.error("usage: --movie <film.mp4> --out <package dir> [--ffmpeg <path>]");
  process.exit(2);
}
const ffmpeg = args.ffmpeg ?? "ffmpeg";
const movie = resolve(args.movie);
const outDir = join(resolve(args.out), "film");
mkdirSync(outDir, { recursive: true });

const encode = ["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-vf", "scale=-2:720", "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-movflags", "+faststart"];

/** One continuous clip [start, start + duration]. */
function cut(name, start, duration) {
  const target = join(outDir, `${name}.mp4`);
  execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", start, "-t", String(duration), "-i", movie, ...encode, target], { stdio: "inherit" });
  console.log(`wrote ${target}`);
}

/** Several pieces joined into one clip (re-encoded through a temporary folder). */
function montage(name, pieces) {
  const tmp = join(outDir, `.${name}-parts`);
  mkdirSync(tmp, { recursive: true });
  const list = [];
  pieces.forEach(([start, duration], i) => {
    const part = join(tmp, `${i}.mp4`);
    execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", start, "-t", String(duration), "-i", movie, ...encode, part], { stdio: "inherit" });
    list.push(`file '${part.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`);
  });
  const listFile = join(tmp, "list.txt");
  writeFileSync(listFile, list.join("\n"));
  const target = join(outDir, `${name}.mp4`);
  execFileSync(ffmpeg, ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-movflags", "+faststart", target], { stdio: "inherit" });
  rmSync(tmp, { recursive: true, force: true });
  console.log(`wrote ${target}`);
}

// Intro: the boys pick the game on the blue icon panel, jack in, and the race starts.
cut("intro", "00:40:17.6", 33.4);
// Menu attract loop: the film's VR worlds (opening shooter, acceleration, network, vortex).
montage("attract", [
  ["00:01:36", 22],
  ["01:00:58", 12],
  ["01:01:38", 6],
  ["01:14:15", 21],
  ["02:04:58", 14]
]);
// Outro: the checker line, the film's own GAME OVER, Jobe pulling the headset off.
cut("outro", "00:41:23.4", 17.6);
// Story mode: one clip before each chapter.
cut("story-1", "00:01:06", 30); // VSI lab, then the war game
cut("story-2", "00:40:17.6", 19); // the boys pick the race on the blue panel
cut("story-3", "00:59:40", 40); // Jobe and Angelo in the lab, just before the acceleration
cut("story-4", "01:14:05", 35); // reaching into the network: golden wave, WARNING
cut("story-5", "01:57:25", 15); // PLEASE ENTER PASS CODE
cut("story-6", "01:35:15", 20); // the fire
cut("story-7", "02:04:10", 48); // the bomb timer, Jobe goes in
