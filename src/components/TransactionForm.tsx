import { useState } from "react";
import { QUALIFICATIONS, type Qualification, type Societe, type Transaction } from "../types";

interface Props {
  societes: Societe[];
  onAdd: (transaction: Omit<Transaction, "id">) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Valide un champ pourcentage optionnel : vide accepté, sinon -100..100. */
function pourcentageOptionnelValide(brut: string): boolean {
  if (!brut) return true;
  const v = Number(brut);
  return !Number.isNaN(v) && v >= -100 && v <= 100;
}

export function TransactionForm({ societes, onAdd }: Props) {
  const [acheteurId, setAcheteurId] = useState("");
  const [cibleId, setCibleId] = useState("");
  const [vendeurId, setVendeurId] = useState("");
  const [date, setDate] = useState(today());
  const [nombreActions, setNombreActions] = useState("");
  const [capital, setCapital] = useState("");
  const [droitVoteTheorique, setDroitVoteTheorique] = useState("");
  const [droitVoteExercable, setDroitVoteExercable] = useState("");
  const [prixAction, setPrixAction] = useState("");
  const [qualification, setQualification] = useState<Qualification>("Simple");
  const [erreur, setErreur] = useState<string | null>(null);

  const societesTriees = [...societes].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  if (societes.length < 2) {
    return (
      <p className="empty">
        Ajoutez au moins deux sociétés pour pouvoir enregistrer une transaction.
      </p>
    );
  }

  function reinitialiser() {
    setAcheteurId("");
    setCibleId("");
    setVendeurId("");
    setDate(today());
    setNombreActions("");
    setCapital("");
    setDroitVoteTheorique("");
    setDroitVoteExercable("");
    setPrixAction("");
    setQualification("Simple");
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
    const pctCapital = Number(capital);
    if (!capital || pctCapital === 0 || pctCapital < -100 || pctCapital > 100) {
      setErreur("Le capital (%) doit être compris entre -100 et 100, sans être nul (positif pour un achat, négatif pour une vente).");
      return;
    }
    if (!pourcentageOptionnelValide(droitVoteTheorique)) {
      setErreur("Le droit de vote théorique (%) doit être compris entre -100 et 100.");
      return;
    }
    if (!pourcentageOptionnelValide(droitVoteExercable)) {
      setErreur("Le droit de vote exerçable (%) doit être compris entre -100 et 100.");
      return;
    }
    if (prixAction && Number(prixAction) < 0) {
      setErreur("Le prix de l'action ne peut pas être négatif.");
      return;
    }
    if (!date) {
      setErreur("Renseignez une date.");
      return;
    }

    onAdd({
      acheteurId,
      cibleId,
      date,
      nombreActions: nombreActions ? Number(nombreActions) : null,
      capital: pctCapital,
      droitVoteTheorique: droitVoteTheorique ? Number(droitVoteTheorique) : null,
      droitVoteExercable: droitVoteExercable ? Number(droitVoteExercable) : null,
      vendeurId: vendeurId || null,
      prixAction: prixAction ? Number(prixAction) : null,
      qualification,
    });

    reinitialiser();
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="tx-acheteur">Société acheteuse</label>
        <select id="tx-acheteur" value={acheteurId} onChange={(e) => setAcheteurId(e.target.value)} required>
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
        <select id="tx-cible" value={cibleId} onChange={(e) => setCibleId(e.target.value)} required>
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
        <label htmlFor="tx-vendeur">Société vendeuse</label>
        <select id="tx-vendeur" value={vendeurId} onChange={(e) => setVendeurId(e.target.value)}>
          <option value="">Non renseignée</option>
          {societesTriees.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="tx-date">Date</label>
        <input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>

      <div className="form-field">
        <label htmlFor="tx-nombre-actions">Nombre d'actions</label>
        <input
          id="tx-nombre-actions"
          type="number"
          step="0.01"
          placeholder="Ex : 100 (achat) ou -100 (vente)"
          value={nombreActions}
          onChange={(e) => setNombreActions(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="tx-capital">Capital (%)</label>
        <input
          id="tx-capital"
          type="number"
          min="-100"
          max="100"
          step="0.01"
          placeholder="Ex : 10 (achat) ou -10 (vente)"
          value={capital}
          onChange={(e) => setCapital(e.target.value)}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="tx-dv-theorique">Droit de vote théorique (%)</label>
        <input
          id="tx-dv-theorique"
          type="number"
          min="-100"
          max="100"
          step="0.01"
          value={droitVoteTheorique}
          onChange={(e) => setDroitVoteTheorique(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="tx-dv-exercable">Droit de vote exerçable (%)</label>
        <input
          id="tx-dv-exercable"
          type="number"
          min="-100"
          max="100"
          step="0.01"
          value={droitVoteExercable}
          onChange={(e) => setDroitVoteExercable(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="tx-prix">Prix de l'action (€)</label>
        <input
          id="tx-prix"
          type="number"
          min="0"
          step="0.01"
          value={prixAction}
          onChange={(e) => setPrixAction(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="tx-qualification">Qualification</label>
        <select
          id="tx-qualification"
          value={qualification}
          onChange={(e) => setQualification(e.target.value as Qualification)}
        >
          {QUALIFICATIONS.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
      </div>

      {erreur && <p className="form-error">{erreur}</p>}

      <button type="submit" className="btn btn-primary">
        Enregistrer la transaction
      </button>
    </form>
  );
}
