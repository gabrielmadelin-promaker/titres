import type { Compte, HistoriqueTotalSociete, Societe, TypeTitre } from "../../types";
import { LONGUEUR_MAX_CATEGORIE, LONGUEUR_MAX_NUMERO_COMPTE } from "../../utils/constantes";
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
  nomDetenteur: string | null;
  societeEmettriceId: string | null;
  nomSociete: string | null;
  categorie: string;
  value: string;
  onChange: (id: string) => void;
  /** Numéro personnalisé à donner au nouveau compte, à la place du numéro auto-généré (ignoré si value n'est pas "" — un compte existant est choisi). */
  numeroPersonnalise: string;
  onChangeNumeroPersonnalise: (numero: string) => void;
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
 * à l'enregistrement. L'option "+ Nouveau compte" prévisualise le nom qui
 * serait généré ("Détenteur - Société émettrice - Catégorie - Numéro") : le
 * numéro n'est connu qu'à l'enregistrement (auto-généré par
 * ComptesService.ResoudreCompte côté backend, sauf numéro personnalisé —
 * seul ce segment final est modifiable ici, jamais le reste du nom), donc
 * affiché "à définir" tant que rien n'est saisi dans le champ qui apparaît
 * juste en dessous, pour ne jamais laisser croire qu'il est déjà déterminé.
 * Un détenteur hors groupe (ou
 * non renseigné, detenteurId null) n'a jamais de compte ni de lot suivi —
 * même règle que ComptesService.ResoudreCompte/TitresLotsService côté
 * serveur : le sélecteur n'apparaît alors pas du tout.
 */
function CompteSelect({
  comptes,
  detenteurId,
  nomDetenteur,
  societeEmettriceId,
  nomSociete,
  categorie,
  value,
  onChange,
  numeroPersonnalise,
  onChangeNumeroPersonnalise,
  idPrefix,
  label,
}: CompteSelectProps) {
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
  // Le numéro réel (auto-généré par défaut, ou personnalisé ici) n'est
  // connu qu'à l'enregistrement (voir ComptesService.ResoudreCompte côté
  // backend) : tant qu'aucun numéro personnalisé n'est saisi, afficher une
  // valeur devinée (ex. un rang) donnerait l'impression à tort que ce
  // numéro est déjà déterminé.
  const segmentNumero = numeroPersonnalise.trim() || "à définir";
  const nomNouveauCompte = `${nomDetenteur ?? "(détenteur)"} - ${nomSociete ?? "(société cible)"} - ${categorieNormalisee ?? "Non catégorisé"} - ${segmentNumero}`;

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
      {value === "" && (
        <input
          type="text"
          maxLength={LONGUEUR_MAX_NUMERO_COMPTE}
          value={numeroPersonnalise}
          onChange={(e) => onChangeNumeroPersonnalise(e.target.value)}
          placeholder="Numéro (à définir)"
          aria-label={`Numéro personnalisé du nouveau compte ${label}`}
        />
      )}
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
  const nomAcheteurDetenteur = societes.find((s) => s.id === acheteurDetenteurId)?.nom ?? null;
  const nomVendeurDetenteur = societes.find((s) => s.id === vendeurDetenteurId)?.nom ?? null;

  function modifierLigne(index: number, champs: Partial<LigneChamps>) {
    onChange(lignes.map((l, i) => (i === index ? { ...l, ...champs } : l)));
  }

  function retirerLigne(index: number) {
    onChange(lignes.filter((_, i) => i !== index));
  }

  function ajouterLigne() {
    onChange([
      ...lignes,
      { categorie: "", nombreActions: "", compteAcheteurId: "", compteVendeurId: "", numeroCompteAcheteur: "", numeroCompteVendeur: "" },
    ]);
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
                    const pct = apercuPourcentageActions(Number(ligne.nombreActions), societeEmettriceId, date, historiqueTotaux, types);
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
              nomDetenteur={nomAcheteurDetenteur}
              societeEmettriceId={societeEmettriceId}
              nomSociete={nomSociete}
              categorie={ligne.categorie}
              value={ligne.compteAcheteurId}
              onChange={(id) => modifierLigne(i, { compteAcheteurId: id })}
              numeroPersonnalise={ligne.numeroCompteAcheteur}
              onChangeNumeroPersonnalise={(numero) => modifierLigne(i, { numeroCompteAcheteur: numero })}
              idPrefix={`${idPrefix}-${i}-compte-acheteur`}
              label="acheteur"
            />
            <CompteSelect
              comptes={comptes}
              detenteurId={vendeurDetenteurId}
              nomDetenteur={nomVendeurDetenteur}
              societeEmettriceId={societeEmettriceId}
              nomSociete={nomSociete}
              categorie={ligne.categorie}
              value={ligne.compteVendeurId}
              onChange={(id) => modifierLigne(i, { compteVendeurId: id })}
              numeroPersonnalise={ligne.numeroCompteVendeur}
              onChangeNumeroPersonnalise={(numero) => modifierLigne(i, { numeroCompteVendeur: numero })}
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
