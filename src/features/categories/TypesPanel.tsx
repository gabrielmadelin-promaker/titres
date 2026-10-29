import { useState } from "react";
import type { TypeTitre } from "../../types";
import { Modal } from "../../components/Modal";

interface Props {
  types: TypeTitre[];
  onAdd: (nom: string) => Promise<boolean>;
  onDelete: (id: string) => void;
}

interface FormAjoutProps {
  onAdd: (nom: string) => Promise<boolean>;
  onSuccess: () => void;
}

function FormAjout({ onAdd, onSuccess }: FormAjoutProps) {
  const [nom, setNom] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nomPropre = nom.trim();
    if (!nomPropre) return;
    const reussi = await onAdd(nomPropre);
    if (reussi) {
      setNom("");
      onSuccess();
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="categorie-nom">Nom de la catégorie</label>
        <input
          id="categorie-nom"
          type="text"
          maxLength={50}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Ex : Action ordinaire"
          autoFocus
        />
      </div>
      <button type="submit" className="btn btn-primary">
        Ajouter
      </button>
    </form>
  );
}

/** Gestion de la liste des Catégories de titres : sert de suggestions sur les champs Catégorie, qui restent du texte libre. */
export function TypesPanel({ types, onAdd, onDelete }: Props) {
  const [modaleOuverte, setModaleOuverte] = useState(false);

  const typesTries = [...types].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  return (
    <div>
      <div className="table-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => setModaleOuverte(true)}>
          + Ajouter une catégorie
        </button>
      </div>
      <Modal title="Ajouter une catégorie" open={modaleOuverte} onClose={() => setModaleOuverte(false)}>
        <FormAjout onAdd={onAdd} onSuccess={() => setModaleOuverte(false)} />
      </Modal>

      {typesTries.length === 0 ? (
        <p className="empty">Aucune catégorie pour le moment.</p>
      ) : (
        <ul className="liste-badges">
          {typesTries.map((t) => (
            <li key={t.id} className="badge-supprimable">
              {t.nom}
              <button type="button" aria-label={`Supprimer la catégorie ${t.nom}`} onClick={() => onDelete(t.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
