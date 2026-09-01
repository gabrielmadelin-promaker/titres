import type { Societe, Transaction } from "../types";

export interface ValorisationCourante {
  valeur: number | null;
  date: string | null;
  source: "transaction" | "manuelle" | "aucune";
}

/**
 * La valorisation retenue pour une société est celle de la transaction la plus
 * récente où cette société est la cible ; à défaut, la valorisation manuelle
 * saisie sur la société ; à défaut, aucune valeur.
 */
export function valorisationCourante(
  societe: Societe,
  transactions: Transaction[],
): ValorisationCourante {
  const transactionsCible = transactions
    .filter((t) => t.cibleId === societe.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const derniere = transactionsCible[0];
  if (derniere) {
    return { valeur: derniere.valorisation, date: derniere.date, source: "transaction" };
  }

  if (societe.valorisationInitiale !== null) {
    return { valeur: societe.valorisationInitiale, date: null, source: "manuelle" };
  }

  return { valeur: null, date: null, source: "aucune" };
}
