import type { Societe, Transaction } from "../types";
import { calculerParticipations } from "./participations";

export interface NoeudOrganigramme {
  id: string;
  nom: string;
  niveau: number;
  x: number;
  y: number;
  /** Largeur réservée à droite de la boîte pour son éventuelle liste d'actionnaires groupés (0 sinon). */
  largeurGroupe: number;
}

export interface LienOrganigramme {
  acheteurId: string;
  cibleId: string;
  pourcentage: number;
  /** Participation croisée détectée (boucle) : tracée différemment, ne détermine pas le niveau. */
  retour: boolean;
  /** Actionnaire "satellite" positionné à côté de sa cible (même rangée) : tracé à l'horizontale. */
  lateral: boolean;
}

export interface EntreeGroupee {
  nom: string;
  pourcentage: number;
}

/** Actionnaires excédentaires d'une cible principale (au-delà des 2 flèches individuelles), voir calculerOrganigramme. */
export interface GroupeActionnaires {
  cibleId: string;
  entrees: EntreeGroupee[];
}

export interface Organigramme {
  noeuds: NoeudOrganigramme[];
  liens: LienOrganigramme[];
  groupes: GroupeActionnaires[];
  largeur: number;
  hauteur: number;
}

export const BOX_W = 148;
export const BOX_H = 44;
export const ROW_GAP = 70;
export const COL_GAP = 24;
export const SPINE_GAP = 40;
export const LARGEUR_GROUPE = 205;
export const GAP_GROUPE = 12;
export const LIGNE_GROUPE_H = 13;
const PADDING = 16;
const MARGE_RETOUR = 70;

/**
 * Dispose TOUTES les sociétés en niveaux (une société non détenue est au
 * niveau 0 ; une société détenue est un niveau sous son actionnaire le plus
 * "haut"), à la manière d'un organigramme de groupe — chaque société a sa
 * boîte, chaque participation sa flèche.
 *
 * L'arbre principal (les sociétés "principale", en général une par niveau
 * dans une chaîne de holdings) forme une colonne verticale centrale fixe
 * ("spine"). Les actionnaires non principaux qui n'ont eux-mêmes aucun
 * actionnaire (des sociétés d'investissement pures, pas d'autres maillons
 * de la chaîne) gravitent à côté de la société qu'ils détiennent le plus —
 * sur la même rangée, à gauche du tronc — plutôt que d'être alignés tout en
 * haut du graphe comme le voudrait un calcul de niveau strict.
 *
 * Seule autre simplification : au-delà de 2 flèches entrantes sur une
 * société marquée "principale", les 2 plus importantes (par %) restent
 * tracées individuellement et les suivantes rejoignent une liste compacte
 * accolée à la boîte. Les sociétés non principales n'ont pas cette limite.
 *
 * Les participations croisées (A détient B qui détient A, directement ou
 * via une chaîne) sont détectées et exclues du calcul de niveau — sans ça,
 * une seule boucle fait diverger tous les niveaux — mais restent tracées
 * comme des liens "retour" distincts.
 */
export function calculerOrganigramme(
  societes: Societe[],
  transactions: Transaction[],
  dateLimite?: string,
): Organigramme {
  const societeParId = new Map(societes.map((s) => [s.id, s]));
  const participations = calculerParticipations(transactions, dateLimite);
  const tousLiens = participations
    .filter((p) => p.pourcentageTotal > 0.001)
    .map((p) => ({ acheteurId: p.acheteurId, cibleId: p.cibleId, pourcentage: p.pourcentageTotal }));

  const idsPrincipales = new Set(societes.filter((s) => s.principale).map((s) => s.id));

  // --- Détection des participations croisées (DFS, sur tout le graphe) ---
  const adjacence = new Map<string, string[]>();
  tousLiens.forEach((l) => {
    if (!adjacence.has(l.acheteurId)) adjacence.set(l.acheteurId, []);
    adjacence.get(l.acheteurId)!.push(l.cibleId);
  });

  const arcsRetour = new Set<string>();
  const etat = new Map<string, "en_cours" | "fini">();
  function visiter(id: string) {
    etat.set(id, "en_cours");
    for (const suivant of adjacence.get(id) ?? []) {
      const s = etat.get(suivant);
      if (s === "en_cours") {
        arcsRetour.add(`${id}::${suivant}`);
      } else if (s !== "fini") {
        visiter(suivant);
      }
    }
    etat.set(id, "fini");
  }
  societes.forEach((s) => {
    if (!etat.has(s.id)) visiter(s.id);
  });

  const liensPourNiveau = tousLiens.filter((l) => !arcsRetour.has(`${l.acheteurId}::${l.cibleId}`));

  // Niveau "naturel" = plus long chemin depuis une société non détenue. Sans
  // boucle (grâce au filtrage ci-dessus), converge en au plus societes.length
  // passes.
  const niveauxBase = new Map<string, number>();
  societes.forEach((s) => niveauxBase.set(s.id, 0));
  for (let i = 0; i < societes.length; i++) {
    let changed = false;
    for (const lien of liensPourNiveau) {
      const niveauParent = niveauxBase.get(lien.acheteurId) ?? 0;
      const niveauEnfant = niveauxBase.get(lien.cibleId) ?? 0;
      if (niveauParent + 1 > niveauEnfant) {
        niveauxBase.set(lien.cibleId, niveauParent + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // --- Liens dessinés individuellement vs regroupés ---
  // Uniquement pour les cibles PRINCIPALES : au-delà de 2 flèches entrantes
  // (les 2 plus grosses par %), les suivantes rejoignent une liste groupée.
  // Les cibles non principales n'ont pas de limite : tout est dessiné.
  interface EntreeCandidate {
    acheteurId: string;
    pourcentage: number;
    nom: string;
    retour: boolean;
  }
  const entreesParCible = new Map<string, EntreeCandidate[]>();
  tousLiens.forEach((l) => {
    if (!entreesParCible.has(l.cibleId)) entreesParCible.set(l.cibleId, []);
    entreesParCible.get(l.cibleId)!.push({
      acheteurId: l.acheteurId,
      pourcentage: l.pourcentage,
      nom: societeParId.get(l.acheteurId)?.nom ?? "(supprimée)",
      retour: arcsRetour.has(`${l.acheteurId}::${l.cibleId}`),
    });
  });

  const liens: LienOrganigramme[] = [];
  const groupes: GroupeActionnaires[] = [];
  const groupeParCible = new Map<string, GroupeActionnaires>();
  let margeDroite = 0;

  entreesParCible.forEach((entrees, cibleId) => {
    const triees = [...entrees].sort((a, b) => b.pourcentage - a.pourcentage);
    const estPrincipale = idsPrincipales.has(cibleId);
    const individuelles = estPrincipale ? triees.slice(0, 2) : triees;

    individuelles.forEach((e) => {
      if (e.retour) margeDroite = Math.max(margeDroite, MARGE_RETOUR);
      liens.push({ acheteurId: e.acheteurId, cibleId, pourcentage: e.pourcentage, retour: e.retour, lateral: false });
    });

    if (estPrincipale && triees.length > 2) {
      const regroupees = triees.slice(2);
      const groupe: GroupeActionnaires = {
        cibleId,
        entrees: regroupees.map((e) => ({ nom: e.nom, pourcentage: e.pourcentage })),
      };
      groupes.push(groupe);
      groupeParCible.set(cibleId, groupe);
    }
  });

  // --- Repérage des "satellites" : sociétés non principales sans aucun
  //     actionnaire (racines) dont la relation la plus significative
  //     effectivement tracée rejoint une cible à un autre niveau. On les
  //     rapproche visuellement de cette cible (même rangée, à gauche du
  //     tronc) plutôt que de les laisser tout en haut du graphe.
  const entrants = new Map<string, number>();
  liensPourNiveau.forEach((l) => entrants.set(l.cibleId, (entrants.get(l.cibleId) ?? 0) + 1));

  const satelliteDeCible = new Map<string, string>();
  societes.forEach((s) => {
    if (idsPrincipales.has(s.id) || (entrants.get(s.id) ?? 0) > 0) return;
    const sesLiens = liens.filter((l) => l.acheteurId === s.id && !l.retour);
    if (sesLiens.length === 0) return;
    const principal = sesLiens.reduce((a, b) => (b.pourcentage > a.pourcentage ? b : a));
    satelliteDeCible.set(s.id, principal.cibleId);
  });

  liens.forEach((l) => {
    if (satelliteDeCible.get(l.acheteurId) === l.cibleId) l.lateral = true;
  });

  const niveauxFinal = new Map<string, number>();
  societes.forEach((s) => {
    const cible = satelliteDeCible.get(s.id);
    niveauxFinal.set(s.id, cible ? (niveauxBase.get(cible) ?? 0) : (niveauxBase.get(s.id) ?? 0));
  });

  // --- Répartition par niveau : les sociétés du tronc (principales et
  //     autres sociétés "de hiérarchie") sont centrées sur une colonne
  //     verticale fixe ("spine") ; les satellites de ce niveau sont placés
  //     à sa gauche, adjacents. ---
  interface Rangee {
    tronc: Societe[];
    satellites: Societe[];
  }
  const parNiveau = new Map<number, Rangee>();
  for (const s of societes) {
    const n = niveauxFinal.get(s.id) ?? 0;
    if (!parNiveau.has(n)) parNiveau.set(n, { tronc: [], satellites: [] });
    const rangee = parNiveau.get(n)!;
    if (satelliteDeCible.has(s.id)) rangee.satellites.push(s);
    else rangee.tronc.push(s);
  }
  parNiveau.forEach(({ tronc, satellites }) => {
    tronc.sort((a, b) => {
      if (a.principale !== b.principale) return a.principale ? -1 : 1;
      return a.nom.localeCompare(b.nom);
    });
    satellites.sort((a, b) => a.nom.localeCompare(b.nom));
  });

  function largeurBoite(id: string): number {
    return BOX_W + (groupeParCible.has(id) ? GAP_GROUPE + LARGEUR_GROUPE : 0);
  }

  let largeurSatellitesMax = 0;
  parNiveau.forEach(({ satellites }) => {
    if (satellites.length === 0) return;
    const l = satellites.reduce((s, n) => s + largeurBoite(n.id) + COL_GAP, 0);
    largeurSatellitesMax = Math.max(largeurSatellitesMax, l);
  });
  const spineX = PADDING + largeurSatellitesMax + (largeurSatellitesMax > 0 ? SPINE_GAP : 0);
  const centreSpine = spineX + BOX_W / 2;

  const niveauxTries = [...parNiveau.keys()].sort((a, b) => a - b);
  const noeuds: NoeudOrganigramme[] = [];
  let bordDroiteMax = spineX + BOX_W;

  niveauxTries.forEach((n) => {
    const { tronc, satellites } = parNiveau.get(n)!;
    const y = PADDING + n * (BOX_H + ROW_GAP);

    // Satellites : de droite (collé au tronc) à gauche.
    let curseurSatelliteX = spineX - SPINE_GAP;
    const positionsSatellites = new Array<number>(satellites.length);
    for (let i = satellites.length - 1; i >= 0; i--) {
      curseurSatelliteX -= largeurBoite(satellites[i].id);
      positionsSatellites[i] = curseurSatelliteX;
      curseurSatelliteX -= COL_GAP;
    }
    satellites.forEach((s, i) => {
      const aGroupe = groupeParCible.has(s.id);
      noeuds.push({
        id: s.id,
        nom: s.nom,
        niveau: n,
        x: positionsSatellites[i],
        y,
        largeurGroupe: aGroupe ? LARGEUR_GROUPE : 0,
      });
    });

    // Tronc : centré sur la colonne verticale fixe. Le centrage porte
    // uniquement sur la largeur des boîtes elles-mêmes (BOX_W) — une liste
    // groupée est un panneau accolé au bord droit d'une boîte, pas une boîte
    // supplémentaire, et ne doit donc pas décaler la boîte vers la gauche
    // (sinon elle empiète sur les satellites, positionnés en supposant que
    // le bord gauche du tronc est bien à spineX).
    const largeurCentrage = tronc.length * BOX_W + Math.max(0, tronc.length - 1) * COL_GAP;
    let curseurX = centreSpine - largeurCentrage / 2;
    tronc.forEach((s) => {
      const aGroupe = groupeParCible.has(s.id);
      noeuds.push({
        id: s.id,
        nom: s.nom,
        niveau: n,
        x: curseurX,
        y,
        largeurGroupe: aGroupe ? LARGEUR_GROUPE : 0,
      });
      const largeur = largeurBoite(s.id);
      bordDroiteMax = Math.max(bordDroiteMax, curseurX + largeur);
      // On avance du plein encombrement (boîte + éventuelle liste groupée)
      // pour ne jamais chevaucher la boîte suivante sur la même rangée.
      curseurX += largeur + COL_GAP;
    });
  });

  const largeur = bordDroiteMax + PADDING + margeDroite;
  const hauteur =
    niveauxTries.length > 0
      ? PADDING * 2 + niveauxTries.length * BOX_H + (niveauxTries.length - 1) * ROW_GAP
      : PADDING * 2;

  return { noeuds, liens, groupes, largeur, hauteur };
}
