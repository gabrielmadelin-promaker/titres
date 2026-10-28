import { useState } from "react";
import type { TypeTitre } from "../types";

interface Props {
  types: TypeTitre[];
  onAdd: (nom: string) => Promise<boolean>;
  onDelete: (id: string) => void;
}

/** Gestion de la liste des Types (A, B, C...) : sert de suggestions sur les champs Catégorie, qui restent du texte libre. */
export function TypesPanel({ types, onAdd, onDelete }: Props) {
  const [nom, setNom] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nomPropre = nom.trim();
    if (!nomPropre) return;
    const reussi = await onAdd(nomPropre);
    if (reussi) setNom("");
  }

  const typesTries = [...types].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  return (
    <div>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="type-nom">Nouveau type</label>
          <input id="type-nom" type="text" maxLength={10} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex : A" />
        </div>
        <button type="submit" className="btn btn-primary">
          Ajouter
        </button>
      </form>
      {typesTries.length === 0 ? (
        <p className="empty">Aucun type pour le moment.</p>
      ) : (
        <ul className="liste-badges">
          {typesTries.map((t) => (
            <li key={t.id} className="badge-supprimable">
              {t.nom}
              <button type="button" aria-label={`Supprimer le type ${t.nom}`} onClick={() => onDelete(t.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
