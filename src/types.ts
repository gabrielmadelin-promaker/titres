export interface Societe {
  id: string;
  nom: string;
  /** Valeur nominale de l'action, dans la devise de la société. */
  valeurNominale: number | null;
  pays: string | null;
  siegeSocial: string | null;
  siren: string | null;
  lei: string | null;
  /**
   * Nombre total d'actions / de droits de vote théorique / de droits de
   * vote exerçable émis par cette société : dénominateur servant à calculer
   * automatiquement les % affichés dans l'application (capital, droit de
   * vote théorique/exerçable). Tant que le total correspondant n'est pas
   * renseigné, le % ne peut pas être calculé pour les transactions qui
   * portent une quantité (voir participations.ts).
   */
  nombreTotalActions: number | null;
  nombreTotalDroitVoteTheorique: number | null;
  nombreTotalDroitVoteExercable: number | null;
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
  /** Nombre de droits de vote théorique échangés (positif = achat, négatif = vente). */
  nombreDroitVoteTheorique: number | null;
  /** Nombre de droits de vote exerçable échangés (positif = achat, négatif = vente). */
  nombreDroitVoteExercable: number | null;
  /** Catégorie du titre (lettre de classe d'action A/B/C...), facultative. */
  categorie: string | null;
  /**
   * Pourcentages historiques, saisis directement avant l'introduction des
   * quantités ci-dessus : plus jamais écrits ni lus par l'application
   * (toujours null pour une transaction créée ou modifiée désormais). Le %
   * affiché est désormais systématiquement dérivé de la quantité
   * correspondante ci-dessus, rapportée au total de la société cible — voir
   * participations.ts — y compris pour les transactions anciennes, dont la
   * quantité a été reconstituée une fois pour toutes à partir de ce même
   * pourcentage par 2026-10-27-backfill-quantites-depuis-pourcentages.sql.
   * Conservés en base uniquement comme archive de la saisie d'origine.
   */
  capital: number | null;
  droitVoteTheorique: number | null;
  droitVoteExercable: number | null;
  /** Société ayant cédé les actions, si connue et membre du groupe (sinon null, voir vendeurNomExterne). */
  vendeurId: string | null;
  /** Nom libre du vendeur quand il est connu mais hors groupe (vendeurId alors null). */
  vendeurNomExterne: string | null;
  /** Prix unitaire de l'action lors de la transaction, en euros. */
  prixAction: number | null;
  qualification: Qualification;
  /**
   * Calculée par l'API, en euros — jamais saisie, jamais stockée en base :
   * recalculée à chaque lecture. Basée sur le FIFO réel des lots d'Actions
   * consommés par cette transaction : |NombreActions| × (PrixAction − prix
   * d'origine moyen des titres effectivement vendus). Nulle si cette
   * transaction n'a fait perdre aucun titre à personne (ex. achat externe
   * pur, sans consommation d'un lot existant) : il n'y a alors pas de prix
   * d'origine auquel se comparer.
   */
  plusValue: number | null;
}

/**
 * Une ligne des tables Actions / DroitsVoteTheorique / DroitsVoteExercable :
 * un LOT de titres (même société émettrice, catégorie, détenteur, prix et
 * date d'acquisition), avec un nombre de titres (quantite) — pas une ligne
 * par titre unitaire : un lot de plusieurs millions de titres tient sur une
 * seule ligne. Générée et mise à jour automatiquement par l'API à chaque
 * création/modification/suppression de transaction — jamais saisie à la
 * main.
 */
export interface Titre {
  id: string;
  /** Société cible qui a émis ces titres. */
  societeEmettriceId: string;
  /** Lettre de catégorie (classe d'action A/B/C...), facultative. */
  categorie: string | null;
  /** Détenteur actuel, si c'est une société suivie (sinon null, voir detenteurNomExterne). */
  societeDetentriceId: string | null;
  /** Nom libre du détenteur actuel quand il est hors groupe (societeDetentriceId alors null). */
  detenteurNomExterne: string | null;
  /** Nombre de titres de ce lot. */
  quantite: number;
  /** Prix à l'émission d'origine : ne change jamais après la création du lot. */
  prixInitial: number | null;
  /** Prix payé par le détenteur actuel (= prixInitial à l'émission, sinon prix de la dernière cession). */
  prixAcquisition: number | null;
  dateAcquisition: string | null;
  /** Transaction à l'origine de l'état actuel de ce lot. */
  transactionOrigineId: string | null;
}
