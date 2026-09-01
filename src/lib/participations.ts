import type { Societe, Transaction } from "../types";
import { valorisationCourante } from "./valorisation";

export interface Participation {
  acheteurId: string;
  cibleId: string;
  /** Somme des tranches, chacune repondérée par (valorisation actuelle de la cible ÷ valorisation de la tranche). */
  pourcentageTotal: number;
  /** Valorisation actuelle de la société cible, servant de base au calcul. */
  valorisationRetenue: number;
  /** Date de cette valorisation actuelle. */
  dateValorisationRetenue: string | null;
  nombreTransactions: number;
}

/**
 * Consolide les transactions par couple (actionnaire, société détenue). Le
 * pourcentage détenu est recalculé à la valorisation actuelle de la société
 * cible : chaque tranche est repondérée par (valorisation actuelle ÷
 * valorisation à la date de la tranche), pour rester cohérent avec le %
 * global cédé affiché sur la société.
 */
export function calculerParticipations(
  transactions: Transaction[],
  societes: Societe[],
): Participation[] {
  const valorisationParCible = new Map<string, { valeur: number; date: string | null }>();
  for (const societe of societes) {
    const v = valorisationCourante(societe, transactions);
    if (v.valeur !== null) {
      valorisationParCible.set(societe.id, { valeur: v.valeur, date: v.date });
    }
  }

  const parCouple = new Map<string, Participation>();

  for (const t of transactions) {
    const vActuelle = valorisationParCible.get(t.cibleId);
    if (!vActuelle) continue;

    const contribution = t.pourcentage * (vActuelle.valeur / t.valorisation);
    const cle = `${t.acheteurId}::${t.cibleId}`;
    const existante = parCouple.get(cle);

    if (!existante) {
      parCouple.set(cle, {
        acheteurId: t.acheteurId,
        cibleId: t.cibleId,
        pourcentageTotal: contribution,
        valorisationRetenue: vActuelle.valeur,
        dateValorisationRetenue: vActuelle.date,
        nombreTransactions: 1,
      });
      continue;
    }

    existante.pourcentageTotal += contribution;
    existante.nombreTransactions += 1;
  }

  return [...parCouple.values()];
}
