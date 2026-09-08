import { useState } from "react";
import type { Societe, Transaction } from "../types";
import { champsVersTransaction, champsVides, validerChamps } from "../lib/transactionChamps";
import { TransactionChampsFields } from "./TransactionChamps";

interface Props {
  societes: Societe[];
  onAdd: (transaction: Omit<Transaction, "id">) => void;
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const messageErreur = validerChamps(champs);
    if (messageErreur) {
      setErreur(messageErreur);
      return;
    }
    onAdd(champsVersTransaction(champs));
    setErreur(null);
    setChamps(champsVides());
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
