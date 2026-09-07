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
export const ROW_GAP = 60;
export const COL_GAP = 20;
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
 * Seule simplification : au-delà de 2 flèches entrantes sur une société
 * marquée "principale", les 2 plus importantes (par %) restent tracées
 * individuellement et les suivantes rejoignent une liste compacte accolée
 * à la boîte, pour ne pas noyer l'arbre principal sous les participations
 * minoritaires. Les sociétés non principales n'ont pas cette limite.
 *
 * Dans chaque niveau, les sociétés principales sont placées en premier et
 * alignées à gauche (pas de centrage) : quand l'essentiel de la structure
 * est une chaîne linéaire de principales, elles restent alignées à la
 * verticale d'un niveau à l'autre plutôt que de zigzaguer selon la largeur
 * des autres sociétés du niveau.
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

  // Niveau = plus long chemin depuis une société non détenue. Sans boucle
  // (grâce au filtrage ci-dessus), converge en au plus societes.length passes.
  const niveaux = new Map<string, number>();
  societes.forEach((s) => niveaux.set(s.id, 0));
  for (let i = 0; i < societes.length; i++) {
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
      liens.push({ acheteurId: e.acheteurId, cibleId, pourcentage: e.pourcentage, retour: e.retour });
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

  // --- Répartition horizontale : principales d'abord et alignées à gauche
  //     (pas centrées), pour que la chaîne principale reste verticale d'un
  //     niveau à l'autre. Chaque boîte réserve, si besoin, la place de sa
  //     liste d'actionnaires groupés à sa droite. ---
  const parNiveau = new Map<number, Societe[]>();
  for (const s of societes) {
    const n = niveaux.get(s.id) ?? 0;
    if (!parNiveau.has(n)) parNiveau.set(n, []);
    parNiveau.get(n)!.push(s);
  }
  for (const liste of parNiveau.values()) {
    liste.sort((a, b) => {
      if (a.principale !== b.principale) return a.principale ? -1 : 1;
      return a.nom.localeCompare(b.nom);
    });
  }

  function largeurBoite(id: string): number {
    return BOX_W + (groupeParCible.has(id) ? GAP_GROUPE + LARGEUR_GROUPE : 0);
  }

  const niveauxTries = [...parNiveau.keys()].sort((a, b) => a - b);
  const noeuds: NoeudOrganigramme[] = [];
  let largeurContenu = 0;
  niveauxTries.forEach((n) => {
    const liste = parNiveau.get(n)!;
    let curseurX = PADDING;
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
    largeurContenu = Math.max(largeurContenu, curseurX - COL_GAP);
  });

  const largeur = largeurContenu + PADDING * 2 + margeDroite;
  const hauteur =
    niveauxTries.length > 0
      ? PADDING * 2 + niveauxTries.length * BOX_H + (niveauxTries.length - 1) * ROW_GAP
      : PADDING * 2;

  return { noeuds, liens, groupes, largeur, hauteur };
}
