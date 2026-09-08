import type { Qualification, Transaction } from "../types";

/** Représentation "brute" (chaînes de formulaire) des champs d'une transaction, partagée entre l'ajout et la modification. */
export interface TransactionChamps {
  acheteurId: string;
  cibleId: string;
  vendeurId: string;
  date: string;
  nombreActions: string;
  capital: string;
  droitVoteTheorique: string;
  droitVoteExercable: string;
  prixAction: string;
  qualification: Qualification;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function champsVides(): TransactionChamps {
  return {
    acheteurId: "",
    cibleId: "",
    vendeurId: "",
    date: today(),
    nombreActions: "",
    capital: "",
    droitVoteTheorique: "",
    droitVoteExercable: "",
    prixAction: "",
    qualification: "Simple",
  };
}

export function champsDepuisTransaction(t: Transaction): TransactionChamps {
  return {
    acheteurId: t.acheteurId,
    cibleId: t.cibleId,
    vendeurId: t.vendeurId ?? "",
    date: t.date,
    nombreActions: t.nombreActions?.toString() ?? "",
    capital: t.capital.toString(),
    droitVoteTheorique: t.droitVoteTheorique?.toString() ?? "",
    droitVoteExercable: t.droitVoteExercable?.toString() ?? "",
    prixAction: t.prixAction?.toString() ?? "",
    qualification: t.qualification,
  };
}

/** Valide un champ pourcentage optionnel : vide accepté, sinon -100..100. */
function pourcentageOptionnelValide(brut: string): boolean {
  if (!brut) return true;
  const v = Number(brut);
  return !Number.isNaN(v) && v >= -100 && v <= 100;
}

export function validerChamps(c: TransactionChamps): string | null {
  if (!c.acheteurId || !c.cibleId) return "Sélectionnez une société acheteuse et une société cible.";
  if (c.acheteurId === c.cibleId) return "La société acheteuse doit être différente de la société cible.";
  const pctCapital = Number(c.capital);
  if (!c.capital || pctCapital === 0 || pctCapital < -100 || pctCapital > 100) {
    return "Le capital (%) doit être compris entre -100 et 100, sans être nul (positif pour un achat, négatif pour une vente).";
  }
  if (!pourcentageOptionnelValide(c.droitVoteTheorique)) return "Le droit de vote théorique (%) doit être compris entre -100 et 100.";
  if (!pourcentageOptionnelValide(c.droitVoteExercable)) return "Le droit de vote exerçable (%) doit être compris entre -100 et 100.";
  if (c.prixAction && Number(c.prixAction) < 0) return "Le prix de l'action ne peut pas être négatif.";
  if (!c.date) return "Renseignez une date.";
  return null;
}

/** À n'appeler qu'après validerChamps() : suppose les champs valides. */
export function champsVersTransaction(c: TransactionChamps): Omit<Transaction, "id"> {
  return {
    acheteurId: c.acheteurId,
    cibleId: c.cibleId,
    date: c.date,
    nombreActions: c.nombreActions ? Number(c.nombreActions) : null,
    capital: Number(c.capital),
    droitVoteTheorique: c.droitVoteTheorique ? Number(c.droitVoteTheorique) : null,
    droitVoteExercable: c.droitVoteExercable ? Number(c.droitVoteExercable) : null,
    vendeurId: c.vendeurId || null,
    prixAction: c.prixAction ? Number(c.prixAction) : null,
    qualification: c.qualification,
  };
}
