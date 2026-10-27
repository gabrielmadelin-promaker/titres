import type { Qualification, Transaction } from "../types";

/** Représentation "brute" (chaînes de formulaire) des champs d'une transaction, partagée entre l'ajout et la modification. */
export interface TransactionChamps {
  /** true = société hors groupe (nom libre dans acheteurNomExterne), false = société suivie (liste acheteurId). */
  acheteurExterne: boolean;
  acheteurId: string;
  acheteurNomExterne: string;
  cibleId: string;
  /** true = vendeur hors groupe (nom libre dans vendeurNomExterne), false = liste vendeurId (peut rester vide = non renseigné). */
  vendeurExterne: boolean;
  vendeurId: string;
  vendeurNomExterne: string;
  date: string;
  nombreActions: string;
  nombreDroitVoteTheorique: string;
  nombreDroitVoteExercable: string;
  categorie: string;
  prixAction: string;
  qualification: Qualification;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function champsVides(): TransactionChamps {
  return {
    acheteurExterne: false,
    acheteurId: "",
    acheteurNomExterne: "",
    cibleId: "",
    vendeurExterne: false,
    vendeurId: "",
    vendeurNomExterne: "",
    date: today(),
    nombreActions: "",
    nombreDroitVoteTheorique: "",
    nombreDroitVoteExercable: "",
    categorie: "",
    prixAction: "",
    qualification: "Simple",
  };
}

export function champsDepuisTransaction(t: Transaction): TransactionChamps {
  return {
    acheteurExterne: t.acheteurId === null,
    acheteurId: t.acheteurId ?? "",
    acheteurNomExterne: t.acheteurNomExterne ?? "",
    cibleId: t.cibleId,
    vendeurExterne: Boolean(t.vendeurNomExterne),
    vendeurId: t.vendeurId ?? "",
    vendeurNomExterne: t.vendeurNomExterne ?? "",
    date: t.date,
    nombreActions: t.nombreActions?.toString() ?? "",
    nombreDroitVoteTheorique: t.nombreDroitVoteTheorique?.toString() ?? "",
    nombreDroitVoteExercable: t.nombreDroitVoteExercable?.toString() ?? "",
    categorie: t.categorie ?? "",
    prixAction: t.prixAction?.toString() ?? "",
    qualification: t.qualification,
  };
}

/** Valide un champ nombre de droits de vote optionnel : vide accepté, sinon un nombre valide, non nul. */
function nombreOptionnelValide(brut: string): boolean {
  if (!brut) return true;
  const v = Number(brut);
  return !Number.isNaN(v) && v !== 0;
}

export function validerChamps(c: TransactionChamps): string | null {
  if (c.acheteurExterne ? !c.acheteurNomExterne.trim() : !c.acheteurId) {
    return "Renseignez la société acheteuse (dans la liste, ou son nom si elle est hors groupe).";
  }
  if (!c.cibleId) return "Sélectionnez une société cible.";
  if (!c.acheteurExterne && c.acheteurId === c.cibleId) {
    return "La société acheteuse doit être différente de la société cible.";
  }
  if (c.vendeurExterne && !c.vendeurNomExterne.trim()) {
    return "Renseignez le nom de la société vendeuse, ou décochez « Hors groupe » si elle n'est pas connue.";
  }
  const nombreActions = Number(c.nombreActions);
  if (!c.nombreActions || Number.isNaN(nombreActions) || nombreActions === 0) {
    return "Le nombre d'actions est requis, et ne peut pas être nul (négatif pour une vente).";
  }
  if (!nombreOptionnelValide(c.nombreDroitVoteTheorique)) {
    return "Le nombre de droits de vote théorique doit être un nombre non nul.";
  }
  if (!nombreOptionnelValide(c.nombreDroitVoteExercable)) {
    return "Le nombre de droits de vote exerçable doit être un nombre non nul.";
  }
  if (c.prixAction && Number(c.prixAction) < 0) return "Le prix de l'action ne peut pas être négatif.";
  if (!c.date) return "Renseignez une date.";
  return null;
}

/** À n'appeler qu'après validerChamps() : suppose les champs valides. */
export function champsVersTransaction(c: TransactionChamps): Omit<Transaction, "id"> {
  return {
    acheteurId: c.acheteurExterne ? null : c.acheteurId,
    acheteurNomExterne: c.acheteurExterne ? c.acheteurNomExterne.trim() : null,
    cibleId: c.cibleId,
    date: c.date,
    nombreActions: Number(c.nombreActions),
    nombreDroitVoteTheorique: c.nombreDroitVoteTheorique ? Number(c.nombreDroitVoteTheorique) : null,
    nombreDroitVoteExercable: c.nombreDroitVoteExercable ? Number(c.nombreDroitVoteExercable) : null,
    categorie: c.categorie.trim() || null,
    vendeurId: c.vendeurExterne ? null : c.vendeurId || null,
    vendeurNomExterne: c.vendeurExterne ? c.vendeurNomExterne.trim() : null,
    prixAction: c.prixAction ? Number(c.prixAction) : null,
    qualification: c.qualification,
    // Calculée côté API, jamais saisie : valeur ignorée par le serveur à
    // l'écriture, remplacée par la vraie valeur renvoyée dans sa réponse.
    plusValue: null,
  };
}
