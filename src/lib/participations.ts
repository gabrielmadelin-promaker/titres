import type { Societe, Transaction } from "../types";
import { valorisationCourante } from "./valorisation";

export interface Participation {
  acheteurId: string;
  cibleId: string;
  /** Somme des pourcentages acquis lors des transactions de ce couple. */
  pourcentageTotal: number;
  /** Valorisation actuelle de la société détenue (information de contexte). */
  valorisationRetenue: number;
  /** Date de cette valorisation actuelle. */
  dateValorisationRetenue: string | null;
  nombreTransactions: number;
}

/**
 * Consolide les transactions par couple (actionnaire, société détenue) : le
 * pourcentage détenu est la simple somme des pourcentages acquis (hypothèse :
 * nombre de titres constant, donc un % acquis reste ce même % quelle que
 * soit l'évolution de la valorisation). La valorisation actuelle de la
 * cible est fournie à titre de contexte, pas comme base de calcul du %.
 *
 * Si `dateLimite` est fournie, seules les transactions antérieures ou
 * égales à cette date sont prises en compte — pour reconstituer la
 * répartition du capital telle qu'elle était à cette date.
 */
export function calculerParticipations(
  transactions: Transaction[],
  societes: Societe[],
  dateLimite?: string,
): Participation[] {
  const transactionsPertinentes = dateLimite
    ? transactions.filter((t) => t.date <= dateLimite)
    : transactions;

  const valorisationParCible = new Map<string, { valeur: number; date: string | null }>();
  for (const societe of societes) {
    const v = valorisationCourante(societe, transactions, dateLimite);
    if (v.valeur !== null) {
      valorisationParCible.set(societe.id, { valeur: v.valeur, date: v.date });
    }
  }

  const parCouple = new Map<string, Participation>();

  for (const t of transactionsPertinentes) {
    const vActuelle = valorisationParCible.get(t.cibleId);
    if (!vActuelle) continue;

    const cle = `${t.acheteurId}::${t.cibleId}`;
    const existante = parCouple.get(cle);

    if (!existante) {
      parCouple.set(cle, {
        acheteurId: t.acheteurId,
        cibleId: t.cibleId,
        pourcentageTotal: t.pourcentage,
        valorisationRetenue: vActuelle.valeur,
        dateValorisationRetenue: vActuelle.date,
        nombreTransactions: 1,
      });
      continue;
    }

    existante.pourcentageTotal += t.pourcentage;
    existante.nombreTransactions += 1;
  }

  return [...parCouple.values()];
}
