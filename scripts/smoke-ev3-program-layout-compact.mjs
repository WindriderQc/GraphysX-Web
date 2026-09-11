import { runProgramLayout } from "./smoke-ev3-program-layout.mjs";

await runProgramLayout({
  viewports: [[800, 480], [320, 844], [390, 844]],
  initialViewport: { width: 320, height: 844 },
  precedingViewport: { width: 1280, height: 720 },
});
