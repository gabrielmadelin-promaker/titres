import type { Societe } from "../types";
import type { TransactionChamps } from "../lib/transactionChamps";

interface Props {
  champs: TransactionChamps;
  onChange: (champs: TransactionChamps) => void;
  societes: Societe[];
  idPrefix: string;
}

/** Champs de saisie d'une transaction, partagés entre le formulaire d'ajout et la ligne de modification. */
export function TransactionChampsFields({ champs, onChange, societes, idPrefix }: Props) {
  const societesTriees = [...societes].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  function set<K extends keyof TransactionChamps>(cle: K, valeur: TransactionChamps[K]) {
    onChange({ ...champs, [cle]: valeur });
  }

  return (
    <>
      <div className="form-field">
        <div className="form-field-entete">
          <label htmlFor={`${idPrefix}-acheteur`}>Société acheteuse</label>
          <label className="form-field-toggle">
            <input
              type="checkbox"
              checked={champs.acheteurExterne}
              onChange={(e) => set("acheteurExterne", e.target.checked)}
            />
            Hors groupe
          </label>
        </div>
        {champs.acheteurExterne ? (
          <input
            id={`${idPrefix}-acheteur`}
            type="text"
            placeholder="Nom de la société (hors groupe)"
            value={champs.acheteurNomExterne}
            onChange={(e) => set("acheteurNomExterne", e.target.value)}
            required
          />
        ) : (
          <select
            id={`${idPrefix}-acheteur`}
            value={champs.acheteurId}
            onChange={(e) => set("acheteurId", e.target.value)}
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
        )}
      </div>

      <div className="form-field">
        <label htmlFor={`${idPrefix}-cible`}>Société cible</label>
        <select id={`${idPrefix}-cible`} value={champs.cibleId} onChange={(e) => set("cibleId", e.target.value)} required>
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
        <div className="form-field-entete">
          <label htmlFor={`${idPrefix}-vendeur`}>Société vendeuse</label>
          <label className="form-field-toggle">
            <input
              type="checkbox"
              checked={champs.vendeurExterne}
              onChange={(e) => set("vendeurExterne", e.target.checked)}
            />
            Hors groupe
          </label>
        </div>
        {champs.vendeurExterne ? (
          <input
            id={`${idPrefix}-vendeur`}
            type="text"
            placeholder="Nom de la société (hors groupe)"
            value={champs.vendeurNomExterne}
            onChange={(e) => set("vendeurNomExterne", e.target.value)}
          />
        ) : (
          <select id={`${idPrefix}-vendeur`} value={champs.vendeurId} onChange={(e) => set("vendeurId", e.target.value)}>
            <option value="">Non renseignée</option>
            {societesTriees.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="form-field">
        <label htmlFor={`${idPrefix}-date`}>Date</label>
        <input
          id={`${idPrefix}-date`}
          type="date"
          value={champs.date}
          onChange={(e) => set("date", e.target.value)}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor={`${idPrefix}-nombre-actions`}>Nombre d'actions</label>
        <input
          id={`${idPrefix}-nombre-actions`}
          type="number"
          step="0.01"
          placeholder="Ex : 100 (achat) ou -100 (vente)"
          value={champs.nombreActions}
          onChange={(e) => set("nombreActions", e.target.value)}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor={`${idPrefix}-dv-theorique`}>Nombre de droits de vote théorique</label>
        <input
          id={`${idPrefix}-dv-theorique`}
          type="number"
          step="0.01"
          placeholder="Ex : 100 (achat) ou -100 (vente)"
          value={champs.nombreDroitVoteTheorique}
          onChange={(e) => set("nombreDroitVoteTheorique", e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor={`${idPrefix}-dv-exercable`}>Nombre de droits de vote exerçable</label>
        <input
          id={`${idPrefix}-dv-exercable`}
          type="number"
          step="0.01"
          placeholder="Ex : 100 (achat) ou -100 (vente)"
          value={champs.nombreDroitVoteExercable}
          onChange={(e) => set("nombreDroitVoteExercable", e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor={`${idPrefix}-categorie`}>Catégorie</label>
        <input
          id={`${idPrefix}-categorie`}
          type="text"
          maxLength={10}
          placeholder="Ex : A, B, C..."
          value={champs.categorie}
          onChange={(e) => set("categorie", e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor={`${idPrefix}-prix`}>Prix de l'action (€)</label>
        <input
          id={`${idPrefix}-prix`}
          type="number"
          min="0"
          step="0.01"
          value={champs.prixAction}
          onChange={(e) => set("prixAction", e.target.value)}
        />
      </div>
    </>
  );
}
