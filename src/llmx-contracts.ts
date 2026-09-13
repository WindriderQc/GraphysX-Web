import type { Group } from "three";
import type { AgentWorldDefinition, AgentWorldVector3 } from "./agent-world-runtime";

/** Persistent appearance only. Conversation identifiers and live drivers never enter a scene. */
export type LlmXFaceAppearance = {
  kind: "voxel-face";
  asset: "forge-mask";
  palette: "forge";
  seed: number;
};

export type LlmXDetail = "high" | "balanced" | "mobile";

/** Presentation inputs match the existing Claude pose model; blink/breath belong to the rig. */
export type LlmXFacePresentation = {
  build: number;
  speak: number;
  speakTone: number;
  gazeX: number;
  gazeY: number;
  attention: number;
  think: number;
  warmth: number;
};

/** A renderer has no session, transport, or independent animation loop. */
export type LlmXFaceRenderer = {
  readonly object: Group;
  setPresentation: (presentation: Readonly<LlmXFacePresentation>) => void;
  tick: (deltaSeconds: number) => void;
  dispose: () => void;
};

export type LlmXEntranceTiming = {
  cameraSeconds: number;
  assemblyDelaySeconds: number;
  assemblySeconds: number;
};

/** The authored world stays ordinary GraphysX data; anchors are presentation metadata. */
export type LlmXEnvironment = {
  id: string;
  label: string;
  world: AgentWorldDefinition;
  faceEntityId: string;
  anchors: {
    cameraStart: AgentWorldVector3;
    cameraRest: AgentWorldVector3;
    cameraTarget: AgentWorldVector3;
    creationCenter: AgentWorldVector3;
  };
  entrance: LlmXEntranceTiming;
};

export type LlmXConversationPhase = "idle" | "listening" | "waiting" | "generating" | "interrupted" | "error";

/** Sample only the actual speech output bus. Queued TTS, the microphone and ambience are excluded. */
export type LlmXSpeechSample = {
  playing: boolean;
  amplitude: number;
  brightness: number;
};

export type LlmXApplication = {
  dispose: () => void;
  state: () => unknown;
  advanceTime: (milliseconds: number) => unknown;
};
