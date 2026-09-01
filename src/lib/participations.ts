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
