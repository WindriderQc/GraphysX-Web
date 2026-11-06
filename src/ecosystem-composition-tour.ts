/** Narration from the reviewed instance composition, never from the historical script. */
import type { EcosystemCatalog } from "./ecosystem-catalog";
import type { TourPicture, TourStep } from "./ecosystem-tour";
export function compositionTourPicture(step: TourStep, catalog: EcosystemCatalog): TourPicture {
  const { nodes, links, ecoNode, narrateNode } = catalog;
  const describe = (ids: readonly string[]): string => ids.map(id => ecoNode(id)).filter(node => node !== null).map(narrateNode).join(" ");
  const result = (title: string, focus: string[], fallback: string, wide = false): TourPicture => {
    const narration = step.kind !== "node" && Object.hasOwn(catalog.narration ?? {}, step.kind)
      ? catalog.narration![step.kind as keyof NonNullable<typeof catalog.narration>]! : fallback;
    return { title, focus: [...new Set(focus)], narration, spokenNarration: catalog.speak(narration), wide,
    amber: nodes.filter(node => node.attention && focus.includes(node.id)).map(node => node.id),
    flow: links.filter(link => focus.includes(link.from) && focus.includes(link.to)).map(link => ({ ...link })),
    };
  };
  if (step.kind === "node") {
    const node = ecoNode(step.id);
    if (!node) throw new Error("Unknown composition node");
    const related = catalog.ecoLinksOf(node.id).flatMap(link => [link.from, link.to]);
    return result(node.name + " · " + node.subtitle, [node.id, ...related, ...(node.host ? [node.host] : []),
      ...catalog.ecoServicesOn(node.id).map(service => service.id)].slice(0, 32), narrateNode(node));
  }
  if (["voice", "image", "memory", "garage"].includes(step.kind)) {
    const flow = catalog.ecoWorkflow(step.kind);
    if (!flow) return result("Parcours non documenté", [], "Ce parcours n’est pas documenté dans cette composition.");
    const paths = [flow.stops, ...(flow.branches ?? [])];
    const picture = result(flow.title, paths.flat().map(stop => stop.node),
      flow.narration ?? [flow.title + ".", ...flow.stops.map(stop => stop.label + (stop.note ? " : " + stop.note : "") + "."), flow.note ?? ""].join(" "));
    picture.flow = paths.flatMap(stops => stops.slice(1).flatMap((stop, i) => stops[i].node === stop.node ? [] : [{ from: stops[i].node, to: stop.node, label: stop.label }]));
    return picture;
  }
  if (step.kind === "overview" || step.kind === "summary") {
    const labels = { host: "hôtes", vm: "VM", service: "services et capacités", edge: "appareils en bordure", client: "clients", spare: "éléments en réserve" };
    const counts = Object.entries(labels).map(([kind, label]) => `${nodes.filter(node => node.kind === kind).length} ${label}`).join(", ");
    return result("Écosystème · Composition revue le " + catalog.date, [],
      `Composition revue le ${catalog.date}. ${nodes.length} composants : ${counts}. ${links.length} relations documentées. ${catalog.ecoIssues().length} points à suivre. Source : ${catalog.source}. Chaque fiche précise sa preuve. Les états opérationnels viennent séparément de Core, pour les composants couverts.`, true);
  }
  let ids: string[] = [], title = "Composition";
  switch (step.kind) {
    case "frank": ids = ["ugfrank", "nas"]; title = "Hébergement et stockage"; break;
    case "alien": ids = ["ugalien"]; title = "Calcul local"; break;
    case "brutal": ids = ["ugbrutal", "devx"]; title = "Poste et développement"; break;
    case "services": ids = nodes.filter(node => node.kind === "service").map(node => node.id); title = "Services et capacités"; break;
    case "network": ids = nodes.filter(node => ["network", "client", "external"].includes(node.kind)).map(node => node.id); title = "Réseau et points d’accès"; break;
    case "edge": ids = nodes.filter(node => node.kind === "edge").map(node => node.id); title = "Appareils en bordure"; break;
    case "spare": ids = nodes.filter(node => node.kind === "spare" || node.status === "planned").map(node => node.id); title = "Réserve et préparation"; break;
    case "watch": ids = catalog.ecoIssues().map(node => node.id); title = "Points documentés à suivre"; break;
  }
  ids = ids.filter(id => ecoNode(id));
  const names = ids.map(id => ecoNode(id)!.name).join(", ");
  return result(title, ids.slice(0, 32), step.kind === "services"
    ? `${ids.length} services et capacités : ${names}. Sélectionne un composant pour son rôle, son hébergement et ses preuves.`
    : describe(ids) || "Aucun composant dans ce groupe.");
}
