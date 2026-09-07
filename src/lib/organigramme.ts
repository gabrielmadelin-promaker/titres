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
}

export interface EntreeGroupee {
  nom: string;
  pourcentage: number;
}

/** Actionnaires d'une société principale non affichés individuellement (voir calculerOrganigramme). */
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
export const ROW_GAP = 60;
export const COL_GAP = 20;
export const LARGEUR_GROUPE = 168;
export const GAP_GROUPE = 12;
export const LIGNE_GROUPE_H = 13;
const PADDING = 16;
const MARGE_RETOUR = 70;

/**
 * Dispose les sociétés "principales" en niveaux (une société non détenue par
 * une autre principale est au niveau 0 ; sinon un niveau sous son
 * actionnaire principal le plus "haut"), à la manière d'un organigramme de
 * groupe. Seules les sociétés principales apparaissent comme boîtes : les
 * autres sont regroupées comme actionnaires minoritaires de la société
 * qu'elles détiennent (liste compacte accolée, pas de boîte ni de ligne
 * dédiée) — de même au-delà de 2 actionnaires PRINCIPAUX entrants pour une
 * même cible, les excédentaires rejoignent aussi cette liste.
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

  const principales = societes.filter((s) => s.principale);
  const idsPrincipales = new Set(principales.map((s) => s.id));

  const liensEntrePrincipales = tousLiens.filter(
    (l) => idsPrincipales.has(l.acheteurId) && idsPrincipales.has(l.cibleId),
  );

  // --- Détection des participations croisées (DFS) ---
  const adjacence = new Map<string, string[]>();
  liensEntrePrincipales.forEach((l) => {
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
  principales.forEach((s) => {
    if (!etat.has(s.id)) visiter(s.id);
  });

  const liensPourNiveau = liensEntrePrincipales.filter((l) => !arcsRetour.has(`${l.acheteurId}::${l.cibleId}`));

  // Niveau = plus long chemin depuis une principale non détenue par une
  // autre principale. Sans boucle (grâce au filtrage ci-dessus), converge
  // en au plus principales.length passes.
  const niveaux = new Map<string, number>();
  principales.forEach((s) => niveaux.set(s.id, 0));
  for (let i = 0; i < principales.length; i++) {
    let changed = false;
    for (const lien of liensPourNiveau) {
      const niveauParent = niveaux.get(lien.acheteurId) ?? 0;
      const niveauEnfant = niveaux.get(lien.cibleId) ?? 0;
      if (niveauParent + 1 > niveauEnfant) {
        niveaux.set(lien.cibleId, niveauParent + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // --- Liens dessinés individuellement vs regroupés (indépendant des positions) ---
  interface EntreeCandidate {
    acheteurId: string;
    pourcentage: number;
    nom: string;
    estPrincipale: boolean;
  }
  const entreesParCible = new Map<string, EntreeCandidate[]>();
  tousLiens.forEach((l) => {
    if (!idsPrincipales.has(l.cibleId)) return;
    if (!entreesParCible.has(l.cibleId)) entreesParCible.set(l.cibleId, []);
    entreesParCible.get(l.cibleId)!.push({
      acheteurId: l.acheteurId,
      pourcentage: l.pourcentage,
      nom: societeParId.get(l.acheteurId)?.nom ?? "(supprimée)",
      estPrincipale: idsPrincipales.has(l.acheteurId),
    });
  });

  const liens: LienOrganigramme[] = [];
  const groupes: GroupeActionnaires[] = [];
  const groupeParCible = new Map<string, GroupeActionnaires>();
  let margeDroite = 0;

  entreesParCible.forEach((entrees, cibleId) => {
    const triees = [...entrees].sort((a, b) => b.pourcentage - a.pourcentage);
    const individuelles = triees.filter((e) => e.estPrincipale).slice(0, 2);
    const idsIndividuelles = new Set(individuelles.map((e) => e.acheteurId));

    individuelles.forEach((e) => {
      const retour = arcsRetour.has(`${e.acheteurId}::${cibleId}`);
      if (retour) margeDroite = Math.max(margeDroite, MARGE_RETOUR);
      liens.push({ acheteurId: e.acheteurId, cibleId, pourcentage: e.pourcentage, retour });
    });

    const regroupees = triees.filter((e) => !idsIndividuelles.has(e.acheteurId));
    if (regroupees.length > 0) {
      const groupe: GroupeActionnaires = { cibleId, entrees: regroupees.map((e) => ({ nom: e.nom, pourcentage: e.pourcentage })) };
      groupes.push(groupe);
      groupeParCible.set(cibleId, groupe);
    }
  });

  // --- Répartition horizontale : chaque boîte réserve, si besoin, la place
  //     de sa liste d'actionnaires groupés à sa droite. ---
  const parNiveau = new Map<number, Societe[]>();
  for (const s of principales) {
    const n = niveaux.get(s.id) ?? 0;
    if (!parNiveau.has(n)) parNiveau.set(n, []);
    parNiveau.get(n)!.push(s);
  }
  for (const liste of parNiveau.values()) {
    liste.sort((a, b) => a.nom.localeCompare(b.nom));
  }

  function largeurBoite(id: string): number {
    return BOX_W + (groupeParCible.has(id) ? GAP_GROUPE + LARGEUR_GROUPE : 0);
  }

  const niveauxTries = [...parNiveau.keys()].sort((a, b) => a - b);
  let largeurMax = 0;
  niveauxTries.forEach((n) => {
    const liste = parNiveau.get(n)!;
    const largeurLigne =
      liste.reduce((somme, s) => somme + largeurBoite(s.id), 0) + (liste.length - 1) * COL_GAP;
    largeurMax = Math.max(largeurMax, largeurLigne);
  });

  const noeuds: NoeudOrganigramme[] = [];
  niveauxTries.forEach((n) => {
    const liste = parNiveau.get(n)!;
    const largeurLigne =
      liste.reduce((somme, s) => somme + largeurBoite(s.id), 0) + (liste.length - 1) * COL_GAP;
    let curseurX = PADDING + (largeurMax - largeurLigne) / 2;
    liste.forEach((s) => {
      const aGroupe = groupeParCible.has(s.id);
      noeuds.push({
        id: s.id,
        nom: s.nom,
        niveau: n,
        x: curseurX,
        y: PADDING + n * (BOX_H + ROW_GAP),
        largeurGroupe: aGroupe ? LARGEUR_GROUPE : 0,
      });
      curseurX += largeurBoite(s.id) + COL_GAP;
    });
  });

  const largeur = largeurMax + PADDING * 2 + margeDroite;
  const hauteur =
    niveauxTries.length > 0
      ? PADDING * 2 + niveauxTries.length * BOX_H + (niveauxTries.length - 1) * ROW_GAP
      : PADDING * 2;

  return { noeuds, liens, groupes, largeur, hauteur };
}
