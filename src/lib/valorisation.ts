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
 *
 * Si `dateLimite` est fournie, seules les transactions et la valorisation
 * manuelle antérieures ou égales à cette date sont prises en compte — pour
 * reconstituer la valorisation telle qu'elle était connue à cette date.
 */
export function valorisationCourante(
  societe: Societe,
  transactions: Transaction[],
  dateLimite?: string,
): ValorisationCourante {
  const candidats: ValorisationCourante[] = transactions
    .filter((t) => t.cibleId === societe.id && (!dateLimite || t.date <= dateLimite))
    .map((t) => ({ valeur: t.valorisation, date: t.date, source: "transaction" as const }));

  const manuelleEligible =
    societe.valorisationInitiale !== null &&
    (!dateLimite || !societe.valorisationInitialeDate || societe.valorisationInitialeDate <= dateLimite);

  if (manuelleEligible) {
    candidats.push({
      valeur: societe.valorisationInitiale as number,
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
 * valorisation actuelle (ou à `dateLimite` si fournie) : chaque tranche est
 * repondérée par le ratio (valorisation retenue ÷ valorisation à la date de
 * la tranche). Une tranche ancienne, acquise à une valorisation plus
 * faible, pèse donc davantage une fois le capital revalorisé.
 */
export function pourcentageGlobal(
  societe: Societe,
  transactions: Transaction[],
  dateLimite?: string,
): number | null {
  const valorisationRetenue = valorisationCourante(societe, transactions, dateLimite).valeur;
  if (!valorisationRetenue) return null;

  return transactions
    .filter((t) => t.cibleId === societe.id && (!dateLimite || t.date <= dateLimite))
    .reduce((somme, t) => somme + t.pourcentage * (valorisationRetenue / t.valorisation), 0);
}
