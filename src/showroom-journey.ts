import type { NestorTour } from "./nestor-tour";

/** Authored camera rails over ordinary scene entities. This tour never edits the document. */
export const GRAPHYSX_DISCOVERY_TOUR: NestorTour = {
  id: "graphysx-discovery", label: "Une minute dans GraphysX", dwellMs: 9000,
  stops: [
    { id: "cubx", entityId: "showroom-cubx", title: "Le cœur du monde",
      line: "Tout ce que tu vois est une scène modifiable. Le Studio et les agents utilisent les mêmes commandes.",
      camera: { position: [5, 8, 9], target: [0, 5.2, -6.2], via: [[14, 10, 15], [11, 9, 7]] } },
    { id: "dna", entityId: "showroom-dna-grove", title: "Un monde qui évolue",
      line: "Ces arbres partagent un ADN. Essaie « génération suivante » : les branches et les couleurs mutent réellement.",
      camera: { position: [14, 5, 5], target: [8, 2.2, -5], via: [[10, 8, 9]] } },
    { id: "physics", entityId: "showroom-plinth", title: "La matière répond",
      line: "Clique sur une pièce pour la pousser, ou au sol pour lâcher une balle. La même physique anime les jeux.",
      camera: { position: [-2, 5.5, 12], target: [-6.2, 1.4, 2.6], via: [[7, 7, 15]] } },
    { id: "flock", entityId: "showroom-starlings", title: "Quelques règles, une vie collective",
      line: "Les oiseaux se séparent, s’alignent et se rassemblent. Tu peux modifier ces règles dans le Studio.",
      camera: { position: [-5, 12, 6], target: [-7, 11, -16], via: [[-10, 8, 10]] } },
    { id: "choose", entityId: "showroom-cubx", title: "À toi de choisir",
      line: "Créations pour découvrir, Jouer pour les défis, Studio pour construire. Les anciennes reprises t’attendent dans Archives & labo.",
      camera: { position: [17, 10, 23], target: [0, 4, -4], via: [[7, 14, 16]] } },
  ],
};
