export type LigneExport = Record<string, string | number>;

/** Construit un classeur .xlsx à partir de lignes objet (clé = en-tête de colonne) et déclenche son téléchargement. */
export async function exporterXlsx(nomFichier: string, nomFeuille: string, lignes: LigneExport[]): Promise<void> {
  // Chargée à la demande : évite d'alourdir le bundle initial (déjà fait pour l'import xlsx).
  const { utils, writeFile } = await import("xlsx");
  const feuille = utils.json_to_sheet(lignes);
  const classeur = utils.book_new();
  utils.book_append_sheet(classeur, feuille, nomFeuille.slice(0, 31));
  writeFile(classeur, nomFichier);
}
