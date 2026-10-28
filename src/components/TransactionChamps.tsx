import { useState } from "react";
import type { Compte, Societe, TypeTitre } from "../types";
import type { TransactionChamps } from "../lib/transactionChamps";

interface Props {
  champs: TransactionChamps;
  onChange: (champs: TransactionChamps) => void;
  societes: Societe[];
  types: TypeTitre[];
  comptes: Compte[];
  onAddCompte: (compte: Omit<Compte, "id">) => Promise<Compte | null>;
  idPrefix: string;
}

interface CompteSelectProps {
  comptes: Compte[];
  detenteurId: string | null;
  detenteurNomExterne: string | null;
  type: string | null;
  value: string;
  onChange: (id: string) => void;
  onAddCompte: (compte: Omit<Compte, "id">) => Promise<Compte | null>;
  idPrefix: string;
  label: string;
}

const NOUVEAU_COMPTE = "__nouveau__";

/**
 * Sélecteur du compte (dbo.Comptes) concerné par cette transaction, pour un
 * camp (acheteur ou vendeur) donné — scopé au détenteur déjà choisi et au
 * Type de la transaction (un compte est toujours dédié à un seul Type).
 * Permet d'en créer un nouveau directement, sans quitter le formulaire.
 */
function CompteSelect({ comptes, detenteurId, detenteurNomExterne, type, value, onChange, onAddCompte, idPrefix, label }: CompteSelectProps) {
  const [creation, setCreation] = useState(false);
  const [nomNouveauCompte, setNomNouveauCompte] = useState("");

  const detenteurRenseigne = detenteurId !== null || Boolean(detenteurNomExterne?.trim());
  const comptesFiltres = comptes.filter((c) =>
    detenteurId !== null ? c.detenteurId === detenteurId : c.detenteurNomExterne === detenteurNomExterne?.trim(),
  );

  async function creerCompte() {
    const nom = nomNouveauCompte.trim();
    if (!nom) return;
    const cree = await onAddCompte({
      detenteurId,
      detenteurNomExterne: detenteurId === null ? (detenteurNomExterne?.trim() ?? null) : null,
      type: type?.trim() || null,
      nom,
    });
    if (!cree) return;
    onChange(cree.id);
    setCreation(false);
    setNomNouveauCompte("");
  }

  if (creation) {
    return (
      <div className="form-field">
        <label htmlFor={`${idPrefix}-nouveau-compte`}>Nom du nouveau compte ({label})</label>
        <div className="compte-creation">
          <input
            id={`${idPrefix}-nouveau-compte`}
            type="text"
            value={nomNouveauCompte}
            onChange={(e) => setNomNouveauCompte(e.target.value)}
            placeholder="Ex : Compte A1"
            autoFocus
          />
          <button type="button" className="btn btn-secondary btn-small" onClick={creerCompte}>
            Créer
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setCreation(false)}>
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="form-field">
      <label htmlFor={`${idPrefix}-compte`}>Compte ({label})</label>
      <select
        id={`${idPrefix}-compte`}
        value={value}
        disabled={!detenteurRenseigne}
        onChange={(e) => {
          if (e.target.value === NOUVEAU_COMPTE) setCreation(true);
          else onChange(e.target.value);
        }}
      >
        <option value="">Non renseigné</option>
        {comptesFiltres.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
        {detenteurRenseigne && <option value={NOUVEAU_COMPTE}>+ Nouveau compte...</option>}
      </select>
    </div>
  );
}

/** Champs de saisie d'une transaction, partagés entre le formulaire d'ajout et la ligne de modification. */
export function TransactionChampsFields({ champs, onChange, societes, types, comptes, onAddCompte, idPrefix }: Props) {
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
              onChange={(e) => onChange({ ...champs, acheteurExterne: e.target.checked, compteAcheteurId: "" })}
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
            onChange={(e) => onChange({ ...champs, acheteurNomExterne: e.target.value, compteAcheteurId: "" })}
            required
          />
        ) : (
          <select
            id={`${idPrefix}-acheteur`}
            value={champs.acheteurId}
            onChange={(e) => onChange({ ...champs, acheteurId: e.target.value, compteAcheteurId: "" })}
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
              onChange={(e) => onChange({ ...champs, vendeurExterne: e.target.checked, compteVendeurId: "" })}
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
            onChange={(e) => onChange({ ...champs, vendeurNomExterne: e.target.value, compteVendeurId: "" })}
          />
        ) : (
          <select
            id={`${idPrefix}-vendeur`}
            value={champs.vendeurId}
            onChange={(e) => onChange({ ...champs, vendeurId: e.target.value, compteVendeurId: "" })}
          >
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
          maxLength={50}
          list={`${idPrefix}-types-suggestions`}
          placeholder="Ex : Action ordinaire"
          value={champs.categorie}
          onChange={(e) => set("categorie", e.target.value)}
        />
        <datalist id={`${idPrefix}-types-suggestions`}>
          {types.map((t) => (
            <option key={t.id} value={t.nom} />
          ))}
        </datalist>
      </div>

      <CompteSelect
        comptes={comptes}
        detenteurId={champs.acheteurExterne ? null : champs.acheteurId || null}
        detenteurNomExterne={champs.acheteurExterne ? champs.acheteurNomExterne : null}
        type={champs.categorie}
        value={champs.compteAcheteurId}
        onChange={(id) => set("compteAcheteurId", id)}
        onAddCompte={onAddCompte}
        idPrefix={`${idPrefix}-compte-acheteur`}
        label="acheteur"
      />

      <CompteSelect
        comptes={comptes}
        detenteurId={champs.vendeurExterne ? null : champs.vendeurId || null}
        detenteurNomExterne={champs.vendeurExterne ? champs.vendeurNomExterne : null}
        type={champs.categorie}
        value={champs.compteVendeurId}
        onChange={(id) => set("compteVendeurId", id)}
        onAddCompte={onAddCompte}
        idPrefix={`${idPrefix}-compte-vendeur`}
        label="vendeur"
      />

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
