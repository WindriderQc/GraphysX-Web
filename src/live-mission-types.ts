export const LIVE_MISSION_SCHEMA = "graphysx.live-mission/v1" as const;
export const LIVE_MISSION_EVENT_SCHEMA = "graphysx.live-mission-event/v1" as const;

export type LiveMissionState =
  | "briefing"
  | "active"
  | "paused"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type LiveMissionStageState =
  | "pending"
  | "assigned"
  | "working"
  | "blocked"
  | "interrupted"
  | "completed"
  | "failed"
  | "cancelled";

export type LiveMissionEvidence = {
  evidenceId: string;
  kind: "observation" | "operation" | "validation";
  summary: string;
  actorId: string;
  actorLabel: string;
  memberId: string;
  at: string;
  seq: number;
  revision: number;
  outcome?: "passed" | "failed";
  inspectedRevision?: number;
  operation?: {
    opId: string;
    path: string;
    intent: string;
    seq: number;
    revision: number;
    baseRevision: number;
    outputs?: unknown[];
    touched: string[];
  };
};

export type LiveMissionStage = {
  stageId: string;
  order: number;
  kind: "explore" | "build" | "validate";
  station: "explore" | "build" | "play";
  title: string;
  capability: "mission:explore" | "mission:build" | "mission:validate";
  status: LiveMissionStageState;
  progress: number;
  assignment: { memberId: string; actorId: string; actorLabel: string } | null;
  evidence: LiveMissionEvidence[];
  latestEvidence: LiveMissionEvidence | null;
  updatedAt: string;
  updatedSeq: number;
};

export type LiveMissionView = {
  schema: typeof LIVE_MISSION_SCHEMA;
  missionId: string;
  templateId: string;
  title: string;
  status: LiveMissionState;
  createdAt: string;
  createdSeq: number;
  createdBy: { memberId: string; actorId: string; actorLabel: string };
  updatedAt: string;
  updatedSeq: number;
  revision: number;
  stages: LiveMissionStage[];
};

export type LiveMissionEvent = {
  schema: typeof LIVE_MISSION_EVENT_SCHEMA;
  event: "mission";
  eventId: string;
  action: "start" | "activate" | "pause" | "resume" | "cancel" | "assign" | "progress" | "interrupt";
  seq: number;
  revision: number;
  at: string;
  sessionId: string;
  missionId: string;
  stageId?: string | null;
  actorId: string;
  actorKind: "human" | "agent" | "system";
  actorLabel: string;
  memberId: string | null;
  role: "owner" | "editor" | "viewer" | "agent" | null;
  reason?: string;
  mission: LiveMissionView;
};

export type LiveMissionReceipt = {
  ok: true;
  schema: typeof LIVE_MISSION_EVENT_SCHEMA;
  eventId: string;
  missionId: string;
  action: LiveMissionEvent["action"];
  seq: number;
  revision: number;
  state: LiveMissionState;
  stageId?: string;
  evidence?: LiveMissionEvidence;
  duplicate?: boolean;
  mission: LiveMissionView;
};

export type LiveMissionStartRequest = {
  eventId: string;
  missionId: string;
  templateId: "agentx-center-artifact-v1";
  assignments: Array<{ stageId: string; memberId: string }>;
};

export type LiveMissionProgressRequest = {
  eventId: string;
  stageId: string;
  state: "working" | "blocked" | "completed" | "failed";
  progress?: number;
  evidence?:
    | { evidenceId: string; kind: "observation"; summary: string }
    | { evidenceId: string; kind: "operation"; opId: string }
    | { evidenceId: string; kind: "validation"; outcome: "passed" | "failed"; summary: string; inspectedRevision: number };
};
