/** Source numbering/grouping is recovered. Names, meshes and destinations are adapters. */
export const CUBZ_MENUS = [
  { label: "Mécanique", short: "Mécanique", buttons: [
    { action: "inspect", label: "Repérer les pièces" }, { action: "colors", label: "Colorer les blocs" },
    { action: "frame", label: "Recentrer la vue" }, { action: "studio", label: "Modifier cette pose" },
  ] },
  { label: "Mondes retrouvés", short: "Mondes", buttons: [
    { action: "atmel", label: "Accueil Atmel" }, { action: "maison", label: "Maison et cuisine" },
    { action: "impreza", label: "Garage Impreza" }, { action: "flightx", label: "Piloter dans FlightX" },
  ] },
  { label: "Créer", short: "Créer", buttons: [
    { action: "studio", label: "Modifier cette pose" }, { action: "library", label: "Mes créations" },
    { action: "dna", label: "Faire muter l’ADN" }, { action: "creation", label: "Atelier de création" },
  ] },
  { label: "Jouer et apprendre", short: "Jouer", buttons: [
    { action: "make-ten", label: "Le jeu du dix" }, { action: "ev3-lab", label: "Atelier robot EV3" },
    { action: "dna", label: "ADN et physique" }, { action: "flightx", label: "Prendre les commandes" },
  ] },
  { label: "Applications", short: "Applis", buttons: [
    { action: "llmx", label: "Rencontrer LLMx" }, { action: "diskx", label: "Explorer DiskX" },
    { action: "ecosystem", label: "Maison connectée" }, { action: "netx", label: "Explorer NetX" },
  ] },
  { label: "Points de vue", short: "Caméras", buttons: [
    { action: "front", label: "Voir de face" }, { action: "back", label: "Voir de derrière" },
    { action: "top", label: "Voir de haut" }, { action: "frame", label: "Vue d’ensemble" },
  ] },
  { label: "Dans le mécanisme", short: "Pièces", buttons: [
    { action: "cores", label: "Sélectionner les cubes" }, { action: "cylinders", label: "Sélectionner les liaisons" },
    { action: "petals", label: "Sélectionner les pétales" }, { action: "inspect", label: "Tout le mécanisme" },
  ] },
  { label: "Conserver et comprendre", short: "Conserver", buttons: [
    { action: "provenance", label: "Ce qui vient de l’archive" }, { action: "export", label: "Exporter cette pose" },
    { action: "colors", label: "Distinguer les pièces" }, { action: "studio", label: "Sauvegarder dans le Studio" },
  ] },
] as const;

export type CubzAction = typeof CUBZ_MENUS[number]["buttons"][number]["action"];
export const CUBZ_ACTIONS = CUBZ_MENUS[0].buttons.map(button => button.action);
export const cubzButtonId = (choice: number, action: CubzAction) => `cubz-action-${choice}-${action}`;
export const cubzButtonNumber = (choice: number, slot: number) => choice * 4 + slot + 1;

/** Only explicit built-in destinations; never forward session credentials or old routes. */
export function cubzDestination(action: CubzAction, base: string, store: string | null): URL | null {
  const apps = ["maison", "impreza", "flightx", "dna", "creation", "make-ten", "ev3-lab", "llmx", "diskx", "ecosystem", "netx"];
  if (!apps.includes(action) && action !== "atmel" && action !== "library") return null;
  const url = new URL(base);
  url.search = ""; url.hash = "";
  if (action === "library") { url.searchParams.set("library", "local"); url.searchParams.set("intro", "0"); }
  else { url.searchParams.set("app", action === "atmel" ? "cubx" : action); if (action === "atmel") url.searchParams.set("view", "atmel"); }
  if (action === "ev3-lab") url.searchParams.set("view", "atelier");
  if (store) url.searchParams.set("store", store);
  return url;
}
