import type { Societe, Transaction } from "../types";
import { calculerParticipations } from "./participations";

export interface NoeudOrganigramme {
  id: string;
  nom: string;
  niveau: number;
  x: number;
  y: number;
}

export interface LienOrganigramme {
  acheteurId: string;
  cibleId: string;
  pourcentage: number;
}

export interface Organigramme {
  noeuds: NoeudOrganigramme[];
  liens: LienOrganigramme[];
  largeur: number;
  hauteur: number;
}

export const BOX_W = 176;
export const BOX_H = 60;
export const ROW_GAP = 72;
const COL_GAP = 28;
const PADDING = 16;

/**
 * Dispose les sociétés en niveaux (une société non détenue est au niveau 0 ;
 * une société détenue est un niveau sous son actionnaire le plus "haut" dans
 * la structure), à la manière d'un organigramme de groupe. Les liens
 * proviennent des participations consolidées (repondérées à la valorisation
 * actuelle), éventuellement limitées à une date.
 */
export function calculerOrganigramme(
  societes: Societe[],
  transactions: Transaction[],
  dateLimite?: string,
): Organigramme {
  const participations = calculerParticipations(transactions, societes, dateLimite);
  const liens: LienOrganigramme[] = participations
    .filter((p) => p.pourcentageTotal > 0.001)
    .map((p) => ({ acheteurId: p.acheteurId, cibleId: p.cibleId, pourcentage: p.pourcentageTotal }));

  // Niveau = plus long chemin depuis une société non détenue. Relaxation
  // bornée au nombre de sociétés : converge sur un DAG, ne boucle jamais
  // même si des données incohérentes forment un cycle.
  const niveaux = new Map<string, number>();
  societes.forEach((s) => niveaux.set(s.id, 0));
  for (let i = 0; i < societes.length; i++) {
    let changed = false;
    for (const lien of liens) {
      const niveauParent = niveaux.get(lien.acheteurId) ?? 0;
      const niveauEnfant = niveaux.get(lien.cibleId) ?? 0;
      if (niveauParent + 1 > niveauEnfant) {
        niveaux.set(lien.cibleId, niveauParent + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const parNiveau = new Map<number, Societe[]>();
  for (const s of societes) {
    const n = niveaux.get(s.id) ?? 0;
    if (!parNiveau.has(n)) parNiveau.set(n, []);
    parNiveau.get(n)!.push(s);
  }
  for (const liste of parNiveau.values()) {
    liste.sort((a, b) => a.nom.localeCompare(b.nom));
  }

  const niveauxTries = [...parNiveau.keys()].sort((a, b) => a - b);
  let largeurMax = 0;
  niveauxTries.forEach((n) => {
    const liste = parNiveau.get(n)!;
    largeurMax = Math.max(largeurMax, liste.length * BOX_W + (liste.length - 1) * COL_GAP);
  });

  const noeuds: NoeudOrganigramme[] = [];
  niveauxTries.forEach((n) => {
    const liste = parNiveau.get(n)!;
    const largeurLigne = liste.length * BOX_W + (liste.length - 1) * COL_GAP;
    const startX = (largeurMax - largeurLigne) / 2;
    liste.forEach((s, i) => {
      noeuds.push({
        id: s.id,
        nom: s.nom,
        niveau: n,
        x: PADDING + startX + i * (BOX_W + COL_GAP),
        y: PADDING + n * (BOX_H + ROW_GAP),
      });
    });
  });

  const largeur = largeurMax + PADDING * 2;
  const hauteur =
    niveauxTries.length > 0
      ? PADDING * 2 + niveauxTries.length * BOX_H + (niveauxTries.length - 1) * ROW_GAP
      : PADDING * 2;

  return { noeuds, liens, largeur, hauteur };
}
