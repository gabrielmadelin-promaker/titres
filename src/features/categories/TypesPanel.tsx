import { useState } from "react";
import type { TypeTitre } from "../../types";
import { Modal } from "../../components/Modal";
import { LONGUEUR_MAX_CATEGORIE } from "../../utils/constantes";

interface Props {
  types: TypeTitre[];
  onAdd: (nom: string, rentreDansCapital?: boolean) => Promise<boolean>;
  onUpdate: (id: string, nom: string, rentreDansCapital: boolean) => void;
  onDelete: (id: string) => void;
}

interface FormAjoutProps {
  onAdd: (nom: string, rentreDansCapital?: boolean) => Promise<boolean>;
  onSuccess: () => void;
}

function FormAjout({ onAdd, onSuccess }: FormAjoutProps) {
  const [nom, setNom] = useState("");
  const [rentreDansCapital, setRentreDansCapital] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nomPropre = nom.trim();
    if (!nomPropre) return;
    const reussi = await onAdd(nomPropre, rentreDansCapital);
    if (reussi) {
      setNom("");
      setRentreDansCapital(true);
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
          maxLength={LONGUEUR_MAX_CATEGORIE}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Ex : Action ordinaire"
          autoFocus
        />
      </div>
      <div className="form-field-checkbox">
        <label>
          <input type="checkbox" checked={rentreDansCapital} onChange={(e) => setRentreDansCapital(e.target.checked)} />
          Rentre dans le capital
        </label>
      </div>
      <button type="submit" className="btn btn-primary">
        Ajouter
      </button>
    </form>
  );
}

/** Gestion de la liste des Catégories de titres : sert de suggestions sur les champs Catégorie, qui restent du texte libre. */
export function TypesPanel({ types, onAdd, onUpdate, onDelete }: Props) {
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
              <label className="form-field-toggle categorie-toggle-capital" title="Rentre dans le capital">
                <input
                  type="checkbox"
                  checked={t.rentreDansCapital}
                  onChange={(e) => onUpdate(t.id, t.nom, e.target.checked)}
                />
                Capital
              </label>
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
