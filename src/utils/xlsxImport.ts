export type RowObject = Record<string, unknown>;

/** Lit la première feuille d'un fichier .xlsx et la renvoie sous forme de lignes objet (clé = en-tête de colonne). */
export async function lireFeuilleXlsx(fichier: File): Promise<RowObject[]> {
  // Chargée à la demande : évite d'alourdir le bundle initial pour une
  // fonctionnalité utilisée occasionnellement.
  const { read, utils } = await import("xlsx");
  const buffer = await fichier.arrayBuffer();
  const classeur = read(buffer, { type: "array", cellDates: true });
  const nomFeuille = classeur.SheetNames[0];
  if (!nomFeuille) return [];
  const feuille = classeur.Sheets[nomFeuille];
  return utils.sheet_to_json<RowObject>(feuille, { defval: "" });
}

/** Cherche une valeur dans une ligne en essayant plusieurs noms de colonne possibles, insensible à la casse/aux espaces. */
export function valeurColonne(ligne: RowObject, ...nomsPossibles: string[]): unknown {
  const cles = Object.keys(ligne);
  for (const nom of nomsPossibles) {
    const cle = cles.find((c) => c.trim().toLowerCase() === nom.toLowerCase());
    if (cle !== undefined) return ligne[cle];
  }
  return undefined;
}

export function texteColonne(ligne: RowObject, ...nomsPossibles: string[]): string {
  const valeur = valeurColonne(ligne, ...nomsPossibles);
  return valeur === undefined || valeur === null ? "" : String(valeur).trim();
}

/** Nombre optionnel : null si la colonne est absente/vide ou non numérique. */
export function nombreColonne(ligne: RowObject, ...nomsPossibles: string[]): number | null {
  const valeur = valeurColonne(ligne, ...nomsPossibles);
  if (valeur === undefined || valeur === null || valeur === "") return null;
  const n = Number(valeur);
  return Number.isNaN(n) ? null : n;
}

const VALEURS_VRAIES = new Set(["oui", "yes", "true", "vrai", "1", "x"]);

/** Interprète une colonne booléenne texte/numérique/case Excel ("Oui", "1", "x", TRUE...). */
export function booleenColonne(ligne: RowObject, ...nomsPossibles: string[]): boolean {
  const valeur = valeurColonne(ligne, ...nomsPossibles);
  if (typeof valeur === "boolean") return valeur;
  if (typeof valeur === "number") return valeur !== 0;
  if (typeof valeur === "string") return VALEURS_VRAIES.has(valeur.trim().toLowerCase());
  return false;
}

/** Convertit une date Excel (objet Date, texte ISO ou jj/mm/aaaa) en chaîne ISO yyyy-mm-dd. */
export function dateExcelVersIso(valeur: unknown): string | null {
  if (valeur instanceof Date) {
    if (Number.isNaN(valeur.getTime())) return null;
    const annee = valeur.getFullYear();
    const mois = String(valeur.getMonth() + 1).padStart(2, "0");
    const jour = String(valeur.getDate()).padStart(2, "0");
    return `${annee}-${mois}-${jour}`;
  }
  if (typeof valeur === "string") {
    const texte = valeur.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(texte)) return texte;
    const francais = texte.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (francais) {
      const [, jour, mois, annee] = francais;
      return `${annee}-${mois.padStart(2, "0")}-${jour.padStart(2, "0")}`;
    }
  }
  if (typeof valeur === "number" && valeur > 0) {
    // Numéro de série Excel (jours depuis 1899-12-30).
    const base = new Date(Date.UTC(1899, 11, 30));
    base.setUTCDate(base.getUTCDate() + Math.floor(valeur));
    return base.toISOString().slice(0, 10);
  }
  return null;
}
