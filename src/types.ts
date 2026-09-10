export interface Societe {
  id: string;
  nom: string;
  /** Apparaît comme boîte dans l'arbre central de l'organigramme ; sinon groupée en actionnaire minoritaire. */
  principale: boolean;
  /** Valeur nominale de l'action, dans la devise de la société. */
  valeurNominale: number | null;
  pays: string | null;
  siegeSocial: string | null;
  siren: string | null;
  lei: string | null;
}

export const QUALIFICATIONS = ["Simple", "Fusion", "TUPE"] as const;
export type Qualification = (typeof QUALIFICATIONS)[number];

export interface Transaction {
  id: string;
  /** Société qui achète des actions, si elle fait partie du groupe (sinon null, voir acheteurNomExterne). */
  acheteurId: string | null;
  /** Nom libre de l'acheteur quand il est hors groupe (acheteurId alors null) ; l'un des deux est toujours renseigné. */
  acheteurNomExterne: string | null;
  /** Société dont les actions sont achetées — toujours une société suivie du groupe. */
  cibleId: string;
  /** Date de la transaction (format ISO yyyy-mm-dd). */
  date: string;
  /** Nombre d'actions échangées (positif = achat, négatif = vente). */
  nombreActions: number | null;
  /** Part du capital de la société cible échangée (positif = achat, négatif = vente). */
  capital: number;
  /** Droit de vote théorique (peut différer du capital : actions à droit de vote double, sans droit de vote...). */
  droitVoteTheorique: number | null;
  /** Droit de vote effectivement exerçable (peut différer du théorique : droits suspendus, autocontrôle...). */
  droitVoteExercable: number | null;
  /** Société ayant cédé les actions, si connue et membre du groupe (sinon null, voir vendeurNomExterne). */
  vendeurId: string | null;
  /** Nom libre du vendeur quand il est connu mais hors groupe (vendeurId alors null). */
  vendeurNomExterne: string | null;
  /** Prix unitaire de l'action lors de la transaction, en euros. */
  prixAction: number | null;
  qualification: Qualification;
}
