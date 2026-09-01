import { useState } from "react";
import type { Societe } from "../types";

interface Props {
  onAdd: (societe: Omit<Societe, "id">) => void;
}

export function SocieteForm({ onAdd }: Props) {
  const [nom, setNom] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nomPropre = nom.trim();
    if (!nomPropre) return;

    onAdd({ nom: nomPropre });

    setNom("");
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
      <button type="submit" className="btn btn-primary">
        Ajouter la société
      </button>
    </form>
  );
}
