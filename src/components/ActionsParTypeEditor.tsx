import type { LigneActionsParType, TypeTitre } from "../types";

interface Props {
  lignes: LigneActionsParType[];
  onChange: (lignes: LigneActionsParType[]) => void;
  types: TypeTitre[];
  idPrefix: string;
}

/**
 * Éditeur du nombre d'actions d'une société ventilé par Type (ex. 10 de
 * Type A + 20 de Type B + 30 de Type C = 60 — voir HistoriqueTotalSociete
 * dans types.ts) : une ligne par Type, total calculé en lecture seule.
 * Partagé entre SocieteForm (totaux à la création) et HistoriqueTotauxPanel
 * (totaux par date d'effet).
 */
export function ActionsParTypeEditor({ lignes, onChange, types, idPrefix }: Props) {
  const total = lignes.reduce((s, l) => s + (Number.isFinite(l.quantite) ? l.quantite : 0), 0);

  function modifierLigne(index: number, champs: Partial<LigneActionsParType>) {
    onChange(lignes.map((l, i) => (i === index ? { ...l, ...champs } : l)));
  }

  function retirerLigne(index: number) {
    onChange(lignes.filter((_, i) => i !== index));
  }

  function ajouterLigne() {
    onChange([...lignes, { type: null, quantite: 0 }]);
  }

  return (
    <div className="form-field actions-par-type">
      <label>Nombre d'actions, par Catégorie</label>
      {lignes.map((ligne, i) => (
        <div className="actions-par-type-ligne" key={i}>
          <input
            type="text"
            maxLength={50}
            list={`${idPrefix}-types-suggestions`}
            value={ligne.type ?? ""}
            onChange={(e) => modifierLigne(i, { type: e.target.value || null })}
            placeholder="Catégorie (ex : Action ordinaire)"
            aria-label={`Catégorie de la ligne ${i + 1}`}
          />
          <input
            type="number"
            step="0.01"
            min="0"
            value={Number.isFinite(ligne.quantite) && ligne.quantite !== 0 ? ligne.quantite : ""}
            onChange={(e) => modifierLigne(i, { quantite: e.target.value ? Number(e.target.value) : 0 })}
            placeholder="Nombre d'actions"
            aria-label={`Quantité de la ligne ${i + 1}`}
          />
          <button type="button" className="btn btn-secondary btn-small" onClick={() => retirerLigne(i)} aria-label="Retirer cette ligne">
            ×
          </button>
        </div>
      ))}
      <datalist id={`${idPrefix}-types-suggestions`}>
        {types.map((t) => (
          <option key={t.id} value={t.nom} />
        ))}
      </datalist>
      <button type="button" className="btn btn-secondary btn-small" onClick={ajouterLigne}>
        + Ajouter une ligne
      </button>
      <p className="actions-par-type-total">
        Total : <strong>{total}</strong>
      </p>
    </div>
  );
}
