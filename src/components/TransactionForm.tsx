import { useState } from "react";
import type { Societe, Transaction } from "../types";
import { champsVersTransaction, champsVides, validerChamps } from "../lib/transactionChamps";
import { TransactionChampsFields } from "./TransactionChamps";

interface Props {
  societes: Societe[];
  onAdd: (transaction: Omit<Transaction, "id">) => Promise<boolean>;
}

export function TransactionForm({ societes, onAdd }: Props) {
  const [champs, setChamps] = useState(champsVides());
  const [erreur, setErreur] = useState<string | null>(null);

  if (societes.length < 2) {
    return (
      <p className="empty">
        Ajoutez au moins deux sociétés pour pouvoir enregistrer une transaction.
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const messageErreur = validerChamps(champs);
    if (messageErreur) {
      setErreur(messageErreur);
      return;
    }
    setErreur(null);
    // En cas d'échec (ex. refusé par le serveur car hors bornes), les champs
    // ne sont pas vidés : l'utilisateur doit pouvoir ajuster sa saisie
    // plutôt que de tout ressaisir depuis zéro.
    const reussi = await onAdd(champsVersTransaction(champs));
    if (reussi) setChamps(champsVides());
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <TransactionChampsFields champs={champs} onChange={setChamps} societes={societes} idPrefix="tx" />

      {erreur && <p className="form-error">{erreur}</p>}

      <button type="submit" className="btn btn-primary">
        Enregistrer la transaction
      </button>
    </form>
  );
}
