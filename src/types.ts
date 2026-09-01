export interface Societe {
  id: string;
  nom: string;
  /** Valorisation manuelle, utilisée tant qu'aucune transaction ne concerne cette société. */
  valorisationInitiale: number | null;
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
  /** Valorisation de la société cible retenue pour cette transaction. */
  valorisation: number;
}
