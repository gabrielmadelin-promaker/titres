import type { Transaction } from "../types";

export interface Participation {
  acheteurId: string;
  cibleId: string;
  /** Somme des pourcentages acquis lors des transactions de ce couple. */
  pourcentageTotal: number;
  nombreTransactions: number;
}

/**
 * Consolide les transactions par couple (actionnaire, société détenue) : le
 * pourcentage détenu est la simple somme des pourcentages acquis.
 *
 * Si `dateLimite` est fournie, seules les transactions antérieures ou
 * égales à cette date sont prises en compte — pour reconstituer la
 * répartition du capital telle qu'elle était à cette date.
 */
export function calculerParticipations(
  transactions: Transaction[],
  dateLimite?: string,
): Participation[] {
  const transactionsPertinentes = dateLimite
    ? transactions.filter((t) => t.date <= dateLimite)
    : transactions;

  const parCouple = new Map<string, Participation>();

  for (const t of transactionsPertinentes) {
    const cle = `${t.acheteurId}::${t.cibleId}`;
    const existante = parCouple.get(cle);

    if (!existante) {
      parCouple.set(cle, {
        acheteurId: t.acheteurId,
        cibleId: t.cibleId,
        pourcentageTotal: t.pourcentage,
        nombreTransactions: 1,
      });
      continue;
    }

    existante.pourcentageTotal += t.pourcentage;
    existante.nombreTransactions += 1;
  }

  return [...parCouple.values()];
}

export interface ParticipationDetaillee {
  acheteurId: string;
  cibleId: string;
  /** Part acquise directement (somme des transactions directes de ce couple). */
  pourcentageDirect: number;
  /** Part totale "look-through" : directe + indirecte via les sociétés intermédiaires détenues. */
  pourcentageTotal: number;
}

const SEUIL_PARTICIPATION = 0.001;

/**
 * Comme calculerParticipations, mais ajoute la part détenue *indirectement*
 * via les sociétés intermédiaires : si A détient 50% de B et B détient 40%
 * de C, A détient indirectement 50% × 40% = 20% de C (en plus d'une
 * éventuelle part directe A→C).
 *
 * Calculé par relaxation à point fixe : total(X,Y) = direct(X,Y) +
 * Σ_Z direct(X,Z) · total(Z,Y) / 100. Chaque passe ajoute les chemins un
 * cran plus longs ; les pourcentages étant ≤ 100, les contributions
 * décroissent géométriquement et la valeur converge en quelques passes même
 * en présence de participations croisées (cycles) — on relâche jusqu'à
 * stabilisation, avec un nombre de passes plafonné par sécurité.
 */
export function calculerParticipationsDetaillees(
  transactions: Transaction[],
  dateLimite?: string,
): ParticipationDetaillee[] {
  const directs = calculerParticipations(transactions, dateLimite);

  const direct = new Map<string, Map<string, number>>();
  directs.forEach((p) => {
    if (!direct.has(p.acheteurId)) direct.set(p.acheteurId, new Map());
    direct.get(p.acheteurId)!.set(p.cibleId, p.pourcentageTotal);
  });

  let total = new Map<string, Map<string, number>>();
  direct.forEach((parCible, x) => total.set(x, new Map(parCible)));

  const acteurs = [...direct.keys()];
  const PASSES = Math.min(40, acteurs.length + 5);

  for (let passe = 0; passe < PASSES; passe++) {
    const suivant = new Map<string, Map<string, number>>();

    for (const x of acteurs) {
      const parCibleX = new Map(direct.get(x));
      direct.get(x)!.forEach((dpct, z) => {
        if (Math.abs(dpct) < SEUIL_PARTICIPATION) return;
        total.get(z)?.forEach((tpct, y) => {
          if (y === x || Math.abs(tpct) < SEUIL_PARTICIPATION) return;
          const contribution = (dpct * tpct) / 100;
          if (Math.abs(contribution) < SEUIL_PARTICIPATION) return;
          parCibleX.set(y, (parCibleX.get(y) ?? 0) + contribution);
        });
      });
      suivant.set(x, parCibleX);
    }

    let changement = false;
    for (const x of acteurs) {
      const avant = total.get(x)!;
      for (const [y, v] of suivant.get(x)!) {
        if (Math.abs(v - (avant.get(y) ?? 0)) > SEUIL_PARTICIPATION) {
          changement = true;
          break;
        }
      }
      if (changement) break;
    }

    total = suivant;
    if (!changement) break;
  }

  const resultat: ParticipationDetaillee[] = [];
  total.forEach((parCible, acheteurId) => {
    parCible.forEach((pourcentageTotal, cibleId) => {
      if (Math.abs(pourcentageTotal) < SEUIL_PARTICIPATION) return;
      resultat.push({
        acheteurId,
        cibleId,
        pourcentageDirect: direct.get(acheteurId)?.get(cibleId) ?? 0,
        pourcentageTotal,
      });
    });
  });
  return resultat;
}

/**
 * Pourcentage global du capital de la société cédé : simple somme des
 * pourcentages acquis lors de ses transactions.
 */
export function pourcentageGlobal(
  societeId: string,
  transactions: Transaction[],
  dateLimite?: string,
): number | null {
  const pertinentes = transactions.filter(
    (t) => t.cibleId === societeId && (!dateLimite || t.date <= dateLimite),
  );
  if (pertinentes.length === 0) return null;
  return pertinentes.reduce((somme, t) => somme + t.pourcentage, 0);
}
