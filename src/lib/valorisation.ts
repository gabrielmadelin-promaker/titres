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
 * Pourcentage global du capital de la société cédé : simple somme des
 * pourcentages acquis lors de ses transactions (hypothèse : le nombre de
 * titres de la société ne change pas dans le temps, donc un % acquis à une
 * date donnée reste ce même % quelle que soit l'évolution de la
 * valorisation par la suite).
 */
export function pourcentageGlobal(
  societe: Societe,
  transactions: Transaction[],
  dateLimite?: string,
): number | null {
  const valorisationActuelle = valorisationCourante(societe, transactions, dateLimite).valeur;
  if (!valorisationActuelle) return null;

  return transactions
    .filter((t) => t.cibleId === societe.id && (!dateLimite || t.date <= dateLimite))
    .reduce((somme, t) => somme + t.pourcentage, 0);
}
