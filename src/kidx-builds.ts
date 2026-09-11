import track3r from "./kidx-track3r-build.json";
import spike3r from "./kidx-spike3r-build.json";
import type { AgentWorldEntityDefinition } from "./agent-world-runtime";

export const KIDX_BUILDS = [
  { ...track3r, documentId: "31313-x-track3r", subtitle: "La base à chenilles et ses accessoires" },
  { ...spike3r, documentId: "31313-x-spik3r", subtitle: "Le robot à pattes et sa queue articulée" },
];
export type KidxBuild = typeof KIDX_BUILDS[number];

export function kidxBuildEntities(build: KidxBuild, step: number): AgentWorldEntityDefinition[] {
  return build.steps.map((item, index) => ({ id: `kidx-assembly-${index}`, label: `${build.label} · assemblage ${index + 1}`,
    type: "model", asset: { id: `kidx-${build.id}-${index}`, url: item.url, format: "graphysx-mesh-json" },
    visible: index <= step, castShadow: true, receiveShadow: true, tags: ["kidx-build", `build-step:${index + 1}`],
  }));
}

export function kidxPartLabel(label: string): string {
  const size = label.match(/\d+\s*x\s*\d+/)?.[0].replace(/\s+/g, "") ?? "";
  if (/Cable/.test(label)) return "Câble EV3";
  if (/EV3.*Brick|Intelligent|Programmable/i.test(label)) return "Brique intelligente EV3";
  if (/Motor/i.test(label)) return /Medium/i.test(label) ? "Moteur moyen EV3" : "Moteur EV3";
  if (/Sensor/i.test(label)) return "Capteur EV3";
  if (/Tread|Track/i.test(label)) return "Chenille";
  if (/Tyre|Tire/i.test(label)) return "Pneu";
  if (/Wheel/i.test(label)) return "Roue";
  if (/Gear/i.test(label)) return "Engrenage";
  if (/Panel/i.test(label)) return `Panneau ${size}`.trim();
  if (/Beam|Liftarm/i.test(label)) return `Poutre Technic ${size}`.trim();
  if (/Connector|Cross Block|Joiner|Pin/i.test(label)) return "Connecteur Technic";
  if (/Axle/i.test(label)) return "Axe Technic";
  if (/Bush/i.test(label)) return "Bague";
  return "Pièce Technic";
}
