import { useState } from "react";
import type { Societe } from "../types";

interface Props {
  onAdd: (societe: Omit<Societe, "id">) => void;
}

export function SocieteForm({ onAdd }: Props) {
  const [nom, setNom] = useState("");
  const [valorisation, setValorisation] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nomPropre = nom.trim();
    if (!nomPropre) return;

    onAdd({
      nom: nomPropre,
      valorisationInitiale: valorisation ? Number(valorisation) : null,
    });

    setNom("");
    setValorisation("");
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
        <label htmlFor="societe-valorisation">Valorisation initiale (€)</label>
        <input
          id="societe-valorisation"
          type="number"
          min="0"
          step="1"
          value={valorisation}
          onChange={(e) => setValorisation(e.target.value)}
          placeholder="Optionnel"
        />
      </div>
      <button type="submit" className="btn btn-primary">
        Ajouter la société
      </button>
    </form>
  );
}
