import { useState } from "react";
import type { Compte, TypeTitre } from "../types";
import type { LigneChamps } from "../lib/transactionChamps";

interface Props {
  lignes: LigneChamps[];
  onChange: (lignes: LigneChamps[]) => void;
  types: TypeTitre[];
  comptes: Compte[];
  onAddCompte: (compte: Omit<Compte, "id">) => Promise<Compte | null>;
  acheteurDetenteurId: string | null;
  acheteurDetenteurNomExterne: string | null;
  vendeurDetenteurId: string | null;
  vendeurDetenteurNomExterne: string | null;
  /** Société cible de la transaction (SocieteEmettriceId des Comptes de chaque ligne). */
  societeEmettriceId: string | null;
  idPrefix: string;
}

interface CompteSelectProps {
  comptes: Compte[];
  detenteurId: string | null;
  detenteurNomExterne: string | null;
  societeEmettriceId: string | null;
  categorie: string;
  value: string;
  onChange: (id: string) => void;
  onAddCompte: (compte: Omit<Compte, "id">) => Promise<Compte | null>;
  idPrefix: string;
  label: string;
}

const NOUVEAU_COMPTE = "__nouveau__";

/**
 * Sélecteur du compte (dbo.Comptes) concerné par une ligne de transaction,
 * pour un camp (acheteur ou vendeur) donné — scopé au détenteur déjà
 * choisi, à la société cible et à la Catégorie de cette ligne (un compte
 * est toujours dédié à une seule Société émettrice et une seule Catégorie,
 * un compte sans l'un des deux renseigné reste compatible avec n'importe
 * laquelle — même règle que côté backend, voir ResoudreCompte). Laisser ce
 * champ vide est volontaire : un compte par défaut est alors trouvé ou créé
 * automatiquement à l'enregistrement.
 */
function CompteSelect({
  comptes,
  detenteurId,
  detenteurNomExterne,
  societeEmettriceId,
  categorie,
  value,
  onChange,
  onAddCompte,
  idPrefix,
  label,
}: CompteSelectProps) {
  const [creation, setCreation] = useState(false);
  const [nomNouveauCompte, setNomNouveauCompte] = useState("");

  const detenteurRenseigne = detenteurId !== null || Boolean(detenteurNomExterne?.trim());
  const categorieNormalisee = categorie.trim() || null;
  const comptesFiltres = comptes.filter(
    (c) =>
      (detenteurId !== null ? c.detenteurId === detenteurId : c.detenteurNomExterne === detenteurNomExterne?.trim()) &&
      (c.societeEmettriceId === null || c.societeEmettriceId === societeEmettriceId) &&
      (c.type === null || c.type === categorieNormalisee),
  );

  async function creerCompte() {
    const nom = nomNouveauCompte.trim();
    if (!nom) return;
    const cree = await onAddCompte({
      detenteurId,
      detenteurNomExterne: detenteurId === null ? (detenteurNomExterne?.trim() ?? null) : null,
      societeEmettriceId,
      type: categorieNormalisee,
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
        <option value="">Auto (trouvé ou créé automatiquement)</option>
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

/**
 * Éditeur des mouvements d'actions d'une transaction, par Catégorie (une
 * transaction peut porter sur plusieurs Catégories à la fois, chacune avec
 * son propre Compte acheteur/vendeur) : une ligne par Catégorie, Compte
 * laissé vide = résolu automatiquement par l'API.
 */
export function TransactionLignesEditor({
  lignes,
  onChange,
  types,
  comptes,
  onAddCompte,
  acheteurDetenteurId,
  acheteurDetenteurNomExterne,
  vendeurDetenteurId,
  vendeurDetenteurNomExterne,
  societeEmettriceId,
  idPrefix,
}: Props) {
  function modifierLigne(index: number, champs: Partial<LigneChamps>) {
    onChange(lignes.map((l, i) => (i === index ? { ...l, ...champs } : l)));
  }

  function retirerLigne(index: number) {
    onChange(lignes.filter((_, i) => i !== index));
  }

  function ajouterLigne() {
    onChange([...lignes, { categorie: "", nombreActions: "", compteAcheteurId: "", compteVendeurId: "" }]);
  }

  return (
    <div className="form-field transaction-lignes">
      <label>Mouvements d'actions, par Catégorie</label>
      {lignes.map((ligne, i) => (
        <fieldset className="transaction-ligne" key={i}>
          <div className="form">
            <div className="form-field">
              <label htmlFor={`${idPrefix}-${i}-categorie`}>Catégorie</label>
              <input
                id={`${idPrefix}-${i}-categorie`}
                type="text"
                maxLength={50}
                list={`${idPrefix}-types-suggestions`}
                placeholder="Ex : Action ordinaire"
                value={ligne.categorie}
                onChange={(e) => modifierLigne(i, { categorie: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor={`${idPrefix}-${i}-nombre-actions`}>Nombre d'actions</label>
              <input
                id={`${idPrefix}-${i}-nombre-actions`}
                type="number"
                step="0.01"
                placeholder="Ex : 100 (achat) ou -100 (vente)"
                value={ligne.nombreActions}
                onChange={(e) => modifierLigne(i, { nombreActions: e.target.value })}
                required
              />
            </div>
            <CompteSelect
              comptes={comptes}
              detenteurId={acheteurDetenteurId}
              detenteurNomExterne={acheteurDetenteurNomExterne}
              societeEmettriceId={societeEmettriceId}
              categorie={ligne.categorie}
              value={ligne.compteAcheteurId}
              onChange={(id) => modifierLigne(i, { compteAcheteurId: id })}
              onAddCompte={onAddCompte}
              idPrefix={`${idPrefix}-${i}-compte-acheteur`}
              label="acheteur"
            />
            <CompteSelect
              comptes={comptes}
              detenteurId={vendeurDetenteurId}
              detenteurNomExterne={vendeurDetenteurNomExterne}
              societeEmettriceId={societeEmettriceId}
              categorie={ligne.categorie}
              value={ligne.compteVendeurId}
              onChange={(id) => modifierLigne(i, { compteVendeurId: id })}
              onAddCompte={onAddCompte}
              idPrefix={`${idPrefix}-${i}-compte-vendeur`}
              label="vendeur"
            />
          </div>
          {lignes.length > 1 && (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => retirerLigne(i)}>
              Retirer cette ligne
            </button>
          )}
        </fieldset>
      ))}
      <datalist id={`${idPrefix}-types-suggestions`}>
        {types.map((t) => (
          <option key={t.id} value={t.nom} />
        ))}
      </datalist>
      <button type="button" className="btn btn-secondary btn-small" onClick={ajouterLigne}>
        + Ajouter une ligne
      </button>
    </div>
  );
}
