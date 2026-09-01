import type { Transaction } from "../types";

export interface Participation {
  acheteurId: string;
  cibleId: string;
  pourcentageTotal: number;
  derniereDate: string;
  derniereValorisation: number;
  nombreTransactions: number;
}

/**
 * Consolide les transactions par couple (actionnaire, société détenue) :
 * pourcentage total détenu, et valorisation/date de la transaction la plus
 * récente de ce couple.
 */
export function calculerParticipations(transactions: Transaction[]): Participation[] {
  const parCouple = new Map<string, Participation>();

  for (const t of transactions) {
    const cle = `${t.acheteurId}::${t.cibleId}`;
    const existante = parCouple.get(cle);

    if (!existante) {
      parCouple.set(cle, {
        acheteurId: t.acheteurId,
        cibleId: t.cibleId,
        pourcentageTotal: t.pourcentage,
        derniereDate: t.date,
        derniereValorisation: t.valorisation,
        nombreTransactions: 1,
      });
      continue;
    }

    existante.pourcentageTotal += t.pourcentage;
    existante.nombreTransactions += 1;
    if (t.date >= existante.derniereDate) {
      existante.derniereDate = t.date;
      existante.derniereValorisation = t.valorisation;
    }
  }

  return [...parCouple.values()];
}
