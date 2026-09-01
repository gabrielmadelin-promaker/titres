import type { Societe, Transaction } from "../types";

export interface ValorisationCourante {
  valeur: number | null;
  date: string | null;
  source: "transaction" | "manuelle" | "aucune";
}

/**
 * La valorisation retenue pour une société est la plus récente parmi :
 * - les transactions dont elle est la cible ;
 * - sa valorisation saisie manuellement (à sa date de saisie).
 * Une valorisation manuelle jamais datée (ancienne donnée) ne sert que de
 * secours si aucune transaction n'existe.
 */
export function valorisationCourante(
  societe: Societe,
  transactions: Transaction[],
): ValorisationCourante {
  const candidats: ValorisationCourante[] = transactions
    .filter((t) => t.cibleId === societe.id)
    .map((t) => ({ valeur: t.valorisation, date: t.date, source: "transaction" as const }));

  if (societe.valorisationInitiale !== null) {
    candidats.push({
      valeur: societe.valorisationInitiale,
      date: societe.valorisationInitialeDate,
      source: "manuelle",
    });
  }

  if (candidats.length === 0) {
    return { valeur: null, date: null, source: "aucune" };
  }

  return candidats.reduce((plusRecent, courant) =>
    (courant.date ?? "") > (plusRecent.date ?? "") ? courant : plusRecent,
  );
}

/**
 * Pourcentage global du capital de la société cédé, recalculé à la
 * valorisation actuelle : chaque tranche est repondérée par le ratio
 * (valorisation actuelle ÷ valorisation à la date de la tranche). Une
 * tranche ancienne, acquise à une valorisation plus faible, pèse donc
 * davantage aujourd'hui qu'au moment de la transaction.
 */
export function pourcentageGlobal(
  societe: Societe,
  transactions: Transaction[],
): number | null {
  const valorisationActuelle = valorisationCourante(societe, transactions).valeur;
  if (!valorisationActuelle) return null;

  return transactions
    .filter((t) => t.cibleId === societe.id)
    .reduce((somme, t) => somme + t.pourcentage * (valorisationActuelle / t.valorisation), 0);
}
