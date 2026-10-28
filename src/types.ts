export interface Societe {
  id: string;
  nom: string;
  /** Valeur nominale de l'action, dans la devise de la société. */
  valeurNominale: number | null;
  pays: string | null;
  siegeSocial: string | null;
  siren: string | null;
  lei: string | null;
}

/** Une ligne (= un Type) de la ventilation du nombre d'actions d'une société à une date d'effet donnée. */
export interface LigneActionsParType {
  /** Lettre de catégorie (A/B/C...), ou null pour une quantité non ventilée (donnée ancienne). */
  type: string | null;
  quantite: number;
}

/**
 * Nombre total d'actions / de droits de vote théorique / de droits de vote
 * exerçable émis par une société, à partir d'une date d'effet — dénominateur
 * servant à calculer automatiquement les % affichés dans l'application
 * (capital, droit de vote théorique/exerçable). Historisé par date plutôt
 * que stocké comme une valeur unique sur la société : une augmentation ou
 * réduction de capital ultérieure ne doit jamais changer le % calculé pour
 * une transaction passée, qui reste rapportée au total en vigueur à SA
 * date (voir extraireValeurTransaction dans participations.ts). Le total
 * applicable à une transaction est celui de la ligne la plus récente dont
 * dateEffet est antérieure ou égale à la date de la transaction ; tant
 * qu'aucune ligne ne couvre cette date (ou que le champ correspondant y est
 * null), le % correspondant ne peut pas être calculé.
 *
 * Le nombre total d'actions n'est pas un champ direct : c'est la somme
 * d'actionsParType (ex. 10 de Type A + 20 de Type B + 30 de Type C = 60),
 * jamais stockée ailleurs. Seuls les droits de vote théorique/exerçable
 * restent un nombre global.
 */
export interface HistoriqueTotalSociete {
  id: string;
  societeId: string;
  /** Date (ISO yyyy-mm-dd) à partir de laquelle ces totaux s'appliquent. */
  dateEffet: string;
  nombreTotalDroitVoteTheorique: number | null;
  nombreTotalDroitVoteExercable: number | null;
  actionsParType: LigneActionsParType[];
}

/**
 * Une catégorie de titre (A, B, C...) — table de référence gérée (ajout
 * possible depuis l'application), utilisée en SUGGESTIONS sur les champs
 * Catégorie (Transaction.categorie, Titre.categorie), qui restent du texte
 * libre, pas une liste fermée.
 */
export interface TypeTitre {
  id: string;
  nom: string;
}

/**
 * Regroupement nommé des titres détenus par un actionnaire (société suivie
 * ou tiers externe), toujours dédié à une seule Société émettrice ET une
 * seule Catégorie (ex. "actions de catégorie A de la société X" est un
 * compte différent de "catégorie A de la société Y"). Choisi sur chaque
 * ligne de transaction (acheteur et/ou vendeur) — ou généré automatiquement
 * si aucun n'est choisi ; les lots générés automatiquement dans l'onglet
 * Titres portent ensuite ce Compte.
 */
export interface Compte {
  id: string;
  /** Détenteur du compte, si c'est une société suivie (sinon null, voir detenteurNomExterne). */
  detenteurId: string | null;
  /** Nom libre du détenteur quand il est hors groupe (detenteurId alors null). */
  detenteurNomExterne: string | null;
  /** Société émettrice à laquelle ce compte est dédié, facultatif. */
  societeEmettriceId: string | null;
  /** Catégorie à laquelle ce compte est dédié, facultatif. */
  type: string | null;
  nom: string;
}

/**
 * Un mouvement d'actions d'une Catégorie donnée au sein d'une transaction
 * (une transaction peut porter sur plusieurs Catégories à la fois).
 */
export interface LigneTransaction {
  id: string;
  /** Catégorie du titre, facultative. */
  categorie: string | null;
  /** Nombre d'actions échangées (positif = achat, négatif = vente). */
  nombreActions: number;
  /** Compte de l'acheteur concerné par cette ligne, facultatif (généré automatiquement si non choisi). */
  compteAcheteurId: string | null;
  /** Compte du vendeur concerné par cette ligne, facultatif (généré automatiquement si non choisi). */
  compteVendeurId: string | null;
  /**
   * Calculée par l'API, en euros — jamais saisie, jamais stockée en base :
   * recalculée à chaque lecture. Basée sur le FIFO réel des lots d'Actions
   * consommés par cette ligne : |nombreActions| × (prixAction de la
   * transaction − prix d'origine moyen des titres effectivement vendus).
   * Nulle si cette ligne n'a fait perdre aucun titre à personne (ex. achat
   * externe pur, sans consommation d'un lot existant) : il n'y a alors pas
   * de prix d'origine auquel se comparer.
   */
  plusValue: number | null;
}

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
  /** Nombre de droits de vote théorique échangés (positif = achat, négatif = vente) — global, non ventilé par Catégorie. */
  nombreDroitVoteTheorique: number | null;
  /** Nombre de droits de vote exerçable échangés (positif = achat, négatif = vente) — global, non ventilé par Catégorie. */
  nombreDroitVoteExercable: number | null;
  /** Société ayant cédé les actions, si connue et membre du groupe (sinon null, voir vendeurNomExterne). */
  vendeurId: string | null;
  /** Nom libre du vendeur quand il est connu mais hors groupe (vendeurId alors null). */
  vendeurNomExterne: string | null;
  /** Prix unitaire de l'action lors de la transaction, en euros (partagé par toutes les lignes). */
  prixAction: number | null;
  /** Mouvements d'actions de cette transaction, par Catégorie (au moins une ligne). */
  lignes: LigneTransaction[];
}

/**
 * Une ligne de la table Actions : un LOT de titres (même société
 * émettrice, catégorie, détenteur, compte, prix et date d'acquisition),
 * avec un nombre de titres (quantite) — pas une ligne par titre unitaire :
 * un lot de plusieurs millions de titres tient sur une seule ligne. Générée
 * et mise à jour automatiquement par l'API à chaque création/modification/
 * suppression de transaction — jamais saisie à la main.
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
  /** Compte du détenteur concerné par ce lot, facultatif. */
  compteId: string | null;
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
