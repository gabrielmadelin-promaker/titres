export interface Societe {
  id: string;
  nom: string;
  /** Valorisation saisie manuellement (à la création ou via "Modifier"). */
  valorisationInitiale: number | null;
  /** Date (ISO yyyy-mm-dd) de la dernière saisie manuelle de valorisation. */
  valorisationInitialeDate: string | null;
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
