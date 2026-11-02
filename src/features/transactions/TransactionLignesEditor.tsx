import type { Compte, HistoriqueTotalSociete, Societe, TypeTitre } from "../../types";
import { LONGUEUR_MAX_CATEGORIE } from "../../utils/constantes";
import { formatPourcentage } from "../../utils/format";
import { apercuPourcentageActions } from "../../utils/participations";
import type { LigneChamps } from "../../utils/transactionChamps";

interface Props {
  lignes: LigneChamps[];
  onChange: (lignes: LigneChamps[]) => void;
  types: TypeTitre[];
  comptes: Compte[];
  societes: Societe[];
  acheteurDetenteurId: string | null;
  vendeurDetenteurId: string | null;
  /** Société cible de la transaction (SocieteEmettriceId des Comptes de chaque ligne). */
  societeEmettriceId: string | null;
  /** Date de la transaction, pour l'aperçu de % (total émis en vigueur à cette date). */
  date: string;
  historiqueTotaux: HistoriqueTotalSociete[];
  idPrefix: string;
}

interface CompteSelectProps {
  comptes: Compte[];
  detenteurId: string | null;
  societeEmettriceId: string | null;
  nomSociete: string | null;
  categorie: string;
  value: string;
  onChange: (id: string) => void;
  idPrefix: string;
  label: string;
}

/**
 * Sélecteur du compte (dbo.Comptes) concerné par une ligne de transaction,
 * pour un camp (acheteur ou vendeur) donné — scopé au détenteur déjà
 * choisi, à la société cible et à la Catégorie de cette ligne (un compte
 * est toujours dédié à une seule Société émettrice et une seule Catégorie,
 * un compte sans l'un des deux renseigné reste compatible avec n'importe
 * laquelle — même règle que côté backend, voir ResoudreCompte). Aucune
 * création manuelle ici : un compte se choisit parmi les existants, ou se
 * laisse vide ("Auto") pour être trouvé ou créé automatiquement par l'API
 * à l'enregistrement — jamais nommé à la main. L'option "+ Nouveau
 * compte" prévisualise le nom qui serait généré (même numérotation que
 * ResoudreCompte côté backend : rang suivant parmi les comptes déjà
 * existants pour ce détenteur et cette société, toutes Catégories
 * confondues) — un aperçu, pas une réservation : le nom réel est recalculé
 * à l'enregistrement. Un détenteur hors groupe (ou non renseigné, detenteurId
 * null) n'a jamais de compte ni de lot suivi — même règle que
 * ComptesService.ResoudreCompte/TitresLotsService côté serveur : le
 * sélecteur n'apparaît alors pas du tout.
 */
function CompteSelect({ comptes, detenteurId, societeEmettriceId, nomSociete, categorie, value, onChange, idPrefix, label }: CompteSelectProps) {
  if (detenteurId === null) {
    return (
      <div className="form-field">
        <label>Compte ({label})</label>
        <p className="form-field-na">Pas de compte : détenteur hors groupe (ou non renseigné), titres non suivis.</p>
      </div>
    );
  }

  const categorieNormalisee = categorie.trim() || null;
  const memeDetenteur = (c: Compte) => c.detenteurId === detenteurId;

  const comptesFiltres = comptes.filter(
    (c) =>
      memeDetenteur(c) &&
      (c.societeEmettriceId === null || c.societeEmettriceId === societeEmettriceId) &&
      (c.type === null || c.type === categorieNormalisee),
  );
  // Même règle de numérotation que ComptesService.ResoudreCompte côté backend :
  // compte toutes les Catégories pour ce détenteur et cette société exacte.
  const rangProchainCompte = comptes.filter((c) => memeDetenteur(c) && c.societeEmettriceId === societeEmettriceId).length + 1;
  const nomNouveauCompte = `${nomSociete ?? "(société cible)"} - ${categorieNormalisee ?? "Non catégorisé"} - ${rangProchainCompte}`;

  return (
    <div className="form-field">
      <label htmlFor={`${idPrefix}-compte`}>Compte ({label})</label>
      <select id={`${idPrefix}-compte`} value={value} onChange={(e) => onChange(e.target.value)}>
        {comptesFiltres.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
        <option value="">+ Nouveau compte ({nomNouveauCompte})</option>
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
  societes,
  acheteurDetenteurId,
  vendeurDetenteurId,
  societeEmettriceId,
  date,
  historiqueTotaux,
  idPrefix,
}: Props) {
  const nomSociete = societes.find((s) => s.id === societeEmettriceId)?.nom ?? null;

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
                maxLength={LONGUEUR_MAX_CATEGORIE}
                list={`${idPrefix}-types-suggestions`}
                placeholder="Ex : Action ordinaire"
                value={ligne.categorie}
                onChange={(e) => modifierLigne(i, { categorie: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor={`${idPrefix}-${i}-nombre-actions`}>
                Nombre d'actions
                {societeEmettriceId &&
                  ligne.nombreActions &&
                  (() => {
                    const pct = apercuPourcentageActions(Number(ligne.nombreActions), societeEmettriceId, date, historiqueTotaux);
                    return pct === null ? null : <span className="label-hint label-hint-pourcentage"> ({formatPourcentage(pct)})</span>;
                  })()}
              </label>
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
              societeEmettriceId={societeEmettriceId}
              nomSociete={nomSociete}
              categorie={ligne.categorie}
              value={ligne.compteAcheteurId}
              onChange={(id) => modifierLigne(i, { compteAcheteurId: id })}
              idPrefix={`${idPrefix}-${i}-compte-acheteur`}
              label="acheteur"
            />
            <CompteSelect
              comptes={comptes}
              detenteurId={vendeurDetenteurId}
              societeEmettriceId={societeEmettriceId}
              nomSociete={nomSociete}
              categorie={ligne.categorie}
              value={ligne.compteVendeurId}
              onChange={(id) => modifierLigne(i, { compteVendeurId: id })}
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
