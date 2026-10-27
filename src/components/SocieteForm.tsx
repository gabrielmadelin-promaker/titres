import { useState } from "react";
import type { Societe } from "../types";
import { PAYS } from "../lib/pays";

interface Props {
  onAdd: (societe: Omit<Societe, "id">) => Promise<boolean>;
}

function champVide(): string {
  return "";
}

export function SocieteForm({ onAdd }: Props) {
  const [nom, setNom] = useState("");
  const [valeurNominale, setValeurNominale] = useState(champVide());
  const [pays, setPays] = useState(champVide());
  const [siegeSocial, setSiegeSocial] = useState(champVide());
  const [siren, setSiren] = useState(champVide());
  const [lei, setLei] = useState(champVide());
  const [nombreTotalActions, setNombreTotalActions] = useState(champVide());
  const [nombreTotalDroitVoteTheorique, setNombreTotalDroitVoteTheorique] = useState(champVide());
  const [nombreTotalDroitVoteExercable, setNombreTotalDroitVoteExercable] = useState(champVide());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nomPropre = nom.trim();
    if (!nomPropre) return;

    // En cas d'échec, les champs ne sont pas vidés : l'utilisateur doit
    // pouvoir ajuster sa saisie plutôt que de tout ressaisir depuis zéro.
    const reussi = await onAdd({
      nom: nomPropre,
      valeurNominale: valeurNominale ? Number(valeurNominale) : null,
      pays: pays || null,
      siegeSocial: siegeSocial.trim() || null,
      siren: siren.trim() || null,
      lei: lei.trim() || null,
      nombreTotalActions: nombreTotalActions ? Number(nombreTotalActions) : null,
      nombreTotalDroitVoteTheorique: nombreTotalDroitVoteTheorique ? Number(nombreTotalDroitVoteTheorique) : null,
      nombreTotalDroitVoteExercable: nombreTotalDroitVoteExercable ? Number(nombreTotalDroitVoteExercable) : null,
    });
    if (!reussi) return;

    setNom("");
    setValeurNominale(champVide());
    setPays(champVide());
    setSiegeSocial(champVide());
    setSiren(champVide());
    setLei(champVide());
    setNombreTotalActions(champVide());
    setNombreTotalDroitVoteTheorique(champVide());
    setNombreTotalDroitVoteExercable(champVide());
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="societe-nom">Nom de la société</label>
        <input
          id="societe-nom"
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Ex : Acme SAS"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="societe-valeur-nominale">Valeur nominale de l'action</label>
        <input
          id="societe-valeur-nominale"
          type="number"
          step="0.0001"
          min="0"
          value={valeurNominale}
          onChange={(e) => setValeurNominale(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="societe-pays">Pays</label>
        <select id="societe-pays" value={pays} onChange={(e) => setPays(e.target.value)}>
          <option value="">Non renseigné</option>
          {PAYS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="societe-siege">Siège social</label>
        <input
          id="societe-siege"
          type="text"
          value={siegeSocial}
          onChange={(e) => setSiegeSocial(e.target.value)}
          placeholder="Adresse du siège"
        />
      </div>

      <div className="form-field">
        <label htmlFor="societe-siren">SIREN</label>
        <input id="societe-siren" type="text" value={siren} onChange={(e) => setSiren(e.target.value)} />
      </div>

      <div className="form-field">
        <label htmlFor="societe-lei">LEI</label>
        <input id="societe-lei" type="text" value={lei} onChange={(e) => setLei(e.target.value)} />
      </div>

      <div className="form-field">
        <label htmlFor="societe-total-actions">Nombre total d'actions émises</label>
        <input
          id="societe-total-actions"
          type="number"
          step="0.01"
          min="0"
          value={nombreTotalActions}
          onChange={(e) => setNombreTotalActions(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="societe-total-dv-theorique">Nombre total de droits de vote théorique émis</label>
        <input
          id="societe-total-dv-theorique"
          type="number"
          step="0.01"
          min="0"
          value={nombreTotalDroitVoteTheorique}
          onChange={(e) => setNombreTotalDroitVoteTheorique(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="societe-total-dv-exercable">Nombre total de droits de vote exerçable émis</label>
        <input
          id="societe-total-dv-exercable"
          type="number"
          step="0.01"
          min="0"
          value={nombreTotalDroitVoteExercable}
          onChange={(e) => setNombreTotalDroitVoteExercable(e.target.value)}
        />
      </div>

      <button type="submit" className="btn btn-primary">
        Ajouter la société
      </button>
    </form>
  );
}
