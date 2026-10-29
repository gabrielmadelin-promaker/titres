export type SensTri = "asc" | "desc";

export interface EtatTri<C extends string> {
  colonne: C;
  sens: SensTri;
}

/** Change de colonne de tri (ordre ascendant par défaut), ou inverse le sens si on reclique la même colonne. */
export function basculerTri<C extends string>(etat: EtatTri<C>, colonne: C): EtatTri<C> {
  if (etat.colonne === colonne) return { colonne, sens: etat.sens === "asc" ? "desc" : "asc" };
  return { colonne, sens: "asc" };
}

export function comparerValeurs(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "fr");
}

/** Flèche indicative à afficher dans l'en-tête de colonne triée (rien pour les autres colonnes). */
export function flecheTri<C extends string>(etat: EtatTri<C>, colonne: C): string {
  if (etat.colonne !== colonne) return "";
  return etat.sens === "asc" ? " ▲" : " ▼";
}
