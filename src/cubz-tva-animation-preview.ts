import {
  CUBZ_TVA_CLIPS,
  CUBZ_TVA_FIDELITY,
  type CubzOpenSample,
  type CubzPlaybackDirection,
  type CubzQuaternion,
  type CubzRotationSample,
  type CubzRotationSelection,
  CubzTvaPlayback,
  type CubzTvaPlaybackSample,
  createCubzOpenPlayback,
  createCubzRotationPlayback
} from "./cubz-tva-animation";

type PreviewMode = "rotation" | "open";
type AnyPlayback = CubzTvaPlayback<CubzRotationSample> | CubzTvaPlayback<CubzOpenSample>;

type PreviewState = {
  mode: PreviewMode;
  direction: CubzPlaybackDirection;
  selection: CubzRotationSelection;
  running: boolean;
  sample: CubzTvaPlaybackSample;
  fidelity: typeof CUBZ_TVA_FIDELITY;
};

function requireCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>("#cubz-tva-animation-canvas");
  if (!canvas) throw new Error("CubZ TVA animation preview canvas is missing.");
  return canvas;
}

function requireContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const found = target.getContext("2d");
  if (!found) throw new Error("CubZ TVA animation preview requires a 2D canvas context.");
  return found;
}

const canvas = requireCanvas();
const context = requireContext(canvas);

let mode: PreviewMode = "rotation";
let direction: CubzPlaybackDirection = "forward";
let selection: CubzRotationSelection = 1;
let playback: AnyPlayback = createCubzRotationPlayback(selection, direction);
let running = true;
let manualTime = false;
let lastFrameTime: number | null = null;

function rebuildPlayback(): void {
  playback = mode === "rotation"
    ? createCubzRotationPlayback(selection, direction)
    : createCubzOpenPlayback(direction);
}

function currentSample(): CubzTvaPlaybackSample {
  return playback.sample();
}

function resize(): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

function roundedRectangle(x: number, y: number, width: number, height: number, radius = 12): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function text(value: string, x: number, y: number, size: number, color = "#d9efff", weight = 500): void {
  context.fillStyle = color;
  context.font = `${weight} ${size}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  context.fillText(value, x, y);
}

function formatQuaternion(quaternion: CubzQuaternion): string {
  return quaternion.map((value) => value.toFixed(6)).join("  ");
}

function drawQuaternionGauge(
  quaternion: CubzQuaternion,
  x: number,
  y: number,
  width: number,
  label: string
): void {
  const labels = ["X", "Y", "Z", "W"];
  const colors = ["#ff718d", "#62e3ad", "#5bbcff", "#f6d365"];
  text(label, x, y, 15, "#ffffff", 700);
  for (let index = 0; index < quaternion.length; index += 1) {
    const rowY = y + 24 + index * 25;
    const zeroX = x + width / 2;
    const extent = quaternion[index] * (width / 2 - 24);
    text(labels[index], x, rowY + 5, 13, colors[index], 700);
    context.strokeStyle = "#24465d";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(zeroX, rowY);
    context.lineTo(zeroX, rowY + 10);
    context.stroke();
    context.fillStyle = colors[index];
    context.fillRect(extent < 0 ? zeroX + extent : zeroX, rowY + 2, Math.abs(extent), 6);
    text(quaternion[index].toFixed(5), x + width - 76, rowY + 7, 11, "#b6d4e6");
  }
}

function drawTimeline(sample: CubzTvaPlaybackSample, width: number, y: number): void {
  const left = 48;
  const timelineWidth = width - left * 2;
  context.fillStyle = "#173247";
  context.fillRect(left, y, timelineWidth, 8);
  context.fillStyle = sample.cursor.direction === "forward" ? "#58d7ff" : "#ffb866";
  context.fillRect(left, y, timelineWidth * sample.cursor.progress, 8);
  const markerX = left + timelineWidth * sample.cursor.progress;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(markerX, y + 4, 6, 0, Math.PI * 2);
  context.fill();
  text(`source frame ${sample.cursor.sourceFrame.toFixed(3)} / ${sample.cursor.startFrame}..${sample.cursor.endFrame}`, left, y + 30, 13, "#a9c9dc");
  text(`${sample.cursor.elapsedSeconds.toFixed(4)}s / ${sample.cursor.durationSeconds.toFixed(4)}s`, width - 260, y + 30, 13, "#a9c9dc");
}

function drawRotation(sample: CubzRotationSample, width: number, height: number): void {
  const panelWidth = Math.min(620, width - 96);
  roundedRectangle(48, 176, panelWidth, 180);
  context.fillStyle = "#0d2537";
  context.fill();
  drawQuaternionGauge(sample.globalCube.quaternion, 70, 204, panelWidth - 44, "GlobalCube — decoded source-order quaternion");
  text(
    sample.globalCube.exactStoredKey
      ? `EXACT MANI KEY @ ${sample.globalCube.lowerFrame}`
      : `SLERP ${sample.globalCube.lowerFrame} → ${sample.globalCube.upperFrame}  α=${sample.globalCube.interpolationAlpha.toFixed(4)}`,
    70,
    336,
    13,
    sample.globalCube.exactStoredKey ? "#63e6a7" : "#f5ce75",
    700
  );

  const cardsY = Math.max(390, height - 118);
  const cardGap = 8;
  const cardWidth = (width - 96 - cardGap * 6) / 7;
  for (const clip of CUBZ_TVA_CLIPS.rotation) {
    const selected = clip.selection === sample.selection;
    const x = 48 + (clip.selection - 1) * (cardWidth + cardGap);
    roundedRectangle(x, cardsY, cardWidth, 68, 8);
    context.fillStyle = selected ? "#1b6e91" : "#102b3e";
    context.fill();
    text(String(clip.selection), x + 12, cardsY + 24, 17, selected ? "#ffffff" : "#8db4ca", 800);
    text(`${clip.startFrame}..${clip.endFrame}`, x + 12, cardsY + 48, 11, "#b7d6e7");
  }
}

function drawOpen(sample: CubzOpenSample, width: number): void {
  const gap = 18;
  const left = 48;
  const cardWidth = (width - left * 2 - gap * 2) / 3;
  const names = ["Right08", "Top08", "Left08"] as const;
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const panel = sample.panels[name];
    const x = left + index * (cardWidth + gap);
    roundedRectangle(x, 176, cardWidth, 232);
    context.fillStyle = "#0d2537";
    context.fill();
    drawQuaternionGauge(panel.quaternion, x + 20, 204, cardWidth - 40, `${name} · node ${panel.nodeId}`);
    text(panel.exactStoredKey ? "EXACT MANI KEY" : "SHORTEST-ARC SLERP", x + 20, 350, 12, panel.exactStoredKey ? "#63e6a7" : "#f5ce75", 700);
    text(`position ${panel.fixedPosition.map((value) => value.toFixed(2)).join(", ")}`, x + 20, 378, 10, "#88aec4");
    text(`scale ${panel.fixedScale.map((value) => value.toFixed(2)).join(", ")}`, x + 20, 395, 10, "#88aec4");
  }
}

function draw(): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const sample = currentSample();
  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07121d");
  gradient.addColorStop(1, "#0d2635");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  text("CubZ TVA exact animation sampler", 48, 52, 25, "#ffffff", 800);
  text(
    mode === "rotation"
      ? `CubeRot · Animation${selection} · ${direction.toUpperCase()} · repaired same-range reverse`
      : `CubeOpen · Box08 panels · ${direction.toUpperCase()}`,
    48,
    82,
    16,
    direction === "forward" ? "#58d7ff" : "#ffb866",
    700
  );
  text("Raw TV3D quaternion order; no web-handedness transform", 48, 109, 13, "#9cc0d3");
  text("Keys 1–7: rotation clips · O: open · C: rotation · R: reverse · Space: run · Home: reset · F: fullscreen", 48, 135, 12, "#739bb1");

  if (sample.kind === "cube-rotation") drawRotation(sample, width, height);
  else drawOpen(sample, width);
  drawTimeline(sample, width, Math.max(448, height - 182));

  const quaternion = sample.kind === "cube-rotation"
    ? sample.globalCube.quaternion
    : sample.panels.Top08.quaternion;
  text(`q  ${formatQuaternion(quaternion)}`, 48, height - 24, 12, "#6f99b0");
}

function state(): PreviewState {
  return { mode, direction, selection, running, sample: currentSample(), fidelity: CUBZ_TVA_FIDELITY };
}

function setSelection(nextSelection: number): PreviewState {
  if (!Number.isInteger(nextSelection) || nextSelection < 1 || nextSelection > 7) {
    throw new RangeError("Preview selection must be 1 through 7.");
  }
  selection = nextSelection as CubzRotationSelection;
  mode = "rotation";
  rebuildPlayback();
  draw();
  return state();
}

function setMode(nextMode: PreviewMode): PreviewState {
  mode = nextMode;
  rebuildPlayback();
  draw();
  return state();
}

function setDirection(nextDirection: CubzPlaybackDirection): PreviewState {
  direction = nextDirection;
  rebuildPlayback();
  draw();
  return state();
}

function frame(now: number): void {
  if (!manualTime && running) {
    const deltaSeconds = lastFrameTime === null ? 0 : Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
    if (!playback.finished) playback.advance(deltaSeconds);
  }
  lastFrameTime = now;
  draw();
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (/^Digit[1-7]$/.test(event.code)) setSelection(Number(event.code.at(-1)));
  if (event.code === "KeyO") setMode("open");
  if (event.code === "KeyC") setMode("rotation");
  if (event.code === "KeyR") setDirection(direction === "forward" ? "reverse" : "forward");
  if (event.code === "Space") running = !running;
  if (event.code === "Home") playback.reset();
  if (event.code === "KeyF") {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void canvas.requestFullscreen();
  }
  draw();
});

const previewWindow = window as typeof window & {
  render_game_to_text?: () => string;
  advanceTime?: (milliseconds: number) => void;
  __CUBZ_TVA_ANIMATION_HARNESS__?: {
    state: () => PreviewState;
    select: (selection: number) => PreviewState;
    open: () => PreviewState;
    rotation: () => PreviewState;
    direction: (direction: CubzPlaybackDirection) => PreviewState;
    running: (running: boolean) => PreviewState;
    seek: (elapsedSeconds: number) => PreviewState;
    advance: (deltaSeconds: number) => PreviewState;
    reset: () => PreviewState;
  };
};

previewWindow.render_game_to_text = () =>
  JSON.stringify({
    diagnostic: "cubz-tva-animation",
    coordinateSystem: "Raw TVA quaternion x,y,z,w source order. No TV3D-to-web handedness transform is applied.",
    controls: "1-7 rotation range, O open, C rotation, R direction, Space run/pause, Home reset, F fullscreen",
    ...state()
  });

previewWindow.advanceTime = (milliseconds: number) => {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError("advanceTime requires non-negative milliseconds.");
  manualTime = true;
  if (running) playback.advance(milliseconds / 1000);
  draw();
};

previewWindow.__CUBZ_TVA_ANIMATION_HARNESS__ = {
  state,
  select: setSelection,
  open: () => setMode("open"),
  rotation: () => setMode("rotation"),
  direction: setDirection,
  running: (nextRunning) => {
    manualTime = true;
    running = nextRunning;
    draw();
    return state();
  },
  seek: (elapsedSeconds) => {
    playback.seek(elapsedSeconds);
    draw();
    return state();
  },
  advance: (deltaSeconds) => {
    playback.advance(deltaSeconds);
    draw();
    return state();
  },
  reset: () => {
    playback.reset();
    draw();
    return state();
  }
};

resize();
requestAnimationFrame(frame);
