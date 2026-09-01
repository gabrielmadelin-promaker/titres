import { useState } from "react";
import type { Societe, Transaction } from "../types";

interface Props {
  societes: Societe[];
  onAdd: (transaction: Omit<Transaction, "id">) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TransactionForm({ societes, onAdd }: Props) {
  const [acheteurId, setAcheteurId] = useState("");
  const [cibleId, setCibleId] = useState("");
  const [pourcentage, setPourcentage] = useState("");
  const [date, setDate] = useState(today());
  const [valorisation, setValorisation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const societesTriees = [...societes].sort((a, b) => a.nom.localeCompare(b.nom));

  if (societes.length < 2) {
    return (
      <p className="empty">
        Ajoutez au moins deux sociétés pour pouvoir enregistrer une transaction.
      </p>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (!acheteurId || !cibleId) {
      setErreur("Sélectionnez une société acheteuse et une société cible.");
      return;
    }
    if (acheteurId === cibleId) {
      setErreur("La société acheteuse doit être différente de la société cible.");
      return;
    }
    const pct = Number(pourcentage);
    if (!pourcentage || pct <= 0 || pct > 100) {
      setErreur("Le pourcentage doit être compris entre 0 et 100.");
      return;
    }
    const val = Number(valorisation);
    if (!valorisation || val <= 0) {
      setErreur("La valorisation doit être un nombre positif.");
      return;
    }
    if (!date) {
      setErreur("Renseignez une date.");
      return;
    }

    onAdd({ acheteurId, cibleId, pourcentage: pct, date, valorisation: val });

    setAcheteurId("");
    setCibleId("");
    setPourcentage("");
    setValorisation("");
    setDate(today());
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="tx-acheteur">Société acheteuse</label>
        <select
          id="tx-acheteur"
          value={acheteurId}
          onChange={(e) => setAcheteurId(e.target.value)}
          required
        >
          <option value="" disabled>
            Choisir...
          </option>
          {societesTriees.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="tx-cible">Société cible</label>
        <select
          id="tx-cible"
          value={cibleId}
          onChange={(e) => setCibleId(e.target.value)}
          required
        >
          <option value="" disabled>
            Choisir...
          </option>
          {societesTriees.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="tx-pourcentage">Pourcentage acheté (%)</label>
        <input
          id="tx-pourcentage"
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={pourcentage}
          onChange={(e) => setPourcentage(e.target.value)}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="tx-date">Date</label>
        <input
          id="tx-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="tx-valorisation">Valorisation de la cible (€)</label>
        <input
          id="tx-valorisation"
          type="number"
          min="0"
          step="1"
          value={valorisation}
          onChange={(e) => setValorisation(e.target.value)}
          required
        />
      </div>

      {erreur && <p className="form-error">{erreur}</p>}

      <button type="submit" className="btn btn-primary">
        Enregistrer la transaction
      </button>
    </form>
  );
}
