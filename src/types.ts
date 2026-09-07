export interface Societe {
  id: string;
  nom: string;
  /** Apparaît comme boîte dans l'arbre central de l'organigramme ; sinon groupée en actionnaire minoritaire. */
  principale: boolean;
}

export interface Transaction {
  id: string;
  /** Société qui achète des actions. */
  acheteurId: string;
  /** Société dont les actions sont achetées. */
  cibleId: string;
  /** Pourcentage du capital de la société cible acquis lors de cette transaction. */
  pourcentage: number;
  /** Date de la transaction (format ISO yyyy-mm-dd). */
  date: string;
}
