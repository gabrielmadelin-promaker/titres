import { useState } from "react";
import type { HistoriqueTotalSociete, LigneActionsParType, Societe, TypeTitre } from "../../types";
import { PAYS } from "../../utils/pays";
import { ActionsParTypeEditor } from "../totaux/ActionsParTypeEditor";

interface Props {
  /** Renvoie l'id de la société créée (ou null en cas d'échec). */
  onAdd: (societe: Omit<Societe, "id">) => Promise<string | null>;
  /** Appelé après une création réussie, uniquement si au moins un total a été renseigné. */
  onAddHistoriqueTotal: (ligne: Omit<HistoriqueTotalSociete, "id">) => Promise<boolean>;
  types: TypeTitre[];
  /** Appelé après une création réussie (ex. pour fermer la fenêtre temporaire qui contient ce formulaire). */
  onSuccess?: () => void;
}

function champVide(): string {
  return "";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Formulaire d'ajout d'une société, avec une première ligne de totaux optionnelle. */
export function SocieteForm({ onAdd, onAddHistoriqueTotal, types, onSuccess }: Props) {
  const [nom, setNom] = useState("");
  const [valeurNominale, setValeurNominale] = useState(champVide());
  const [pays, setPays] = useState(champVide());
  const [siegeSocial, setSiegeSocial] = useState(champVide());
  const [siren, setSiren] = useState(champVide());
  const [lei, setLei] = useState(champVide());
  const [dateEffetTotaux, setDateEffetTotaux] = useState(today());
  const [actionsParType, setActionsParType] = useState<LigneActionsParType[]>([]);
  const [nombreTotalDroitVoteTheorique, setNombreTotalDroitVoteTheorique] = useState(champVide());
  const [nombreTotalDroitVoteExercable, setNombreTotalDroitVoteExercable] = useState(champVide());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nomPropre = nom.trim();
    if (!nomPropre) return;

    // En cas d'échec, les champs ne sont pas vidés : l'utilisateur doit
    // pouvoir ajuster sa saisie plutôt que de tout ressaisir depuis zéro.
    const societeId = await onAdd({
      nom: nomPropre,
      valeurNominale: valeurNominale ? Number(valeurNominale) : null,
      pays: pays || null,
      siegeSocial: siegeSocial.trim() || null,
      siren: siren.trim() || null,
      lei: lei.trim() || null,
    });
    if (!societeId) return;

    // Les totaux ne sont qu'une commodité à la création (éviter d'avoir à
    // rouvrir la société pour les saisir juste après) : aucun n'est requis,
    // et une ligne d'historique n'est créée que si au moins une quantité ou
    // un total de droits de vote est renseigné.
    const lignesActions = actionsParType.filter((l) => l.quantite !== 0);
    if (lignesActions.length > 0 || nombreTotalDroitVoteTheorique || nombreTotalDroitVoteExercable) {
      await onAddHistoriqueTotal({
        societeId,
        dateEffet: dateEffetTotaux || today(),
        actionsParType: lignesActions,
        nombreTotalDroitVoteTheorique: nombreTotalDroitVoteTheorique ? Number(nombreTotalDroitVoteTheorique) : null,
        nombreTotalDroitVoteExercable: nombreTotalDroitVoteExercable ? Number(nombreTotalDroitVoteExercable) : null,
      });
    }

    setNom("");
    setValeurNominale(champVide());
    setPays(champVide());
    setSiegeSocial(champVide());
    setSiren(champVide());
    setLei(champVide());
    setDateEffetTotaux(today());
    setActionsParType([]);
    setNombreTotalDroitVoteTheorique(champVide());
    setNombreTotalDroitVoteExercable(champVide());
    onSuccess?.();
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

      <div className="form-field">
        <label htmlFor="societe-valeur-nominale">Valeur nominale de l'action</label>
        <input
          id="societe-valeur-nominale"
          type="number"
          step="0.0001"
          min="0"
          value={valeurNominale}
          onChange={(e) => setValeurNominale(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="societe-pays">Pays</label>
        <select id="societe-pays" value={pays} onChange={(e) => setPays(e.target.value)}>
          <option value="">Non renseigné</option>
          {PAYS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="societe-siege">Siège social</label>
        <input
          id="societe-siege"
          type="text"
          value={siegeSocial}
          onChange={(e) => setSiegeSocial(e.target.value)}
          placeholder="Adresse du siège"
        />
      </div>

      <div className="form-field">
        <label htmlFor="societe-siren">SIREN</label>
        <input id="societe-siren" type="text" value={siren} onChange={(e) => setSiren(e.target.value)} />
      </div>

      <div className="form-field">
        <label htmlFor="societe-lei">LEI</label>
        <input id="societe-lei" type="text" value={lei} onChange={(e) => setLei(e.target.value)} />
      </div>

      <div className="form-field">
        <label htmlFor="societe-totaux-date">Totaux en vigueur depuis le</label>
        <input
          id="societe-totaux-date"
          type="date"
          value={dateEffetTotaux}
          onChange={(e) => setDateEffetTotaux(e.target.value)}
        />
      </div>

      <ActionsParTypeEditor lignes={actionsParType} onChange={setActionsParType} types={types} idPrefix="societe-ajout" />

      <div className="form-field">
        <label htmlFor="societe-total-dv-theorique">Nombre total de droits de vote théorique émis</label>
        <input
          id="societe-total-dv-theorique"
          type="number"
          step="0.01"
          min="0"
          value={nombreTotalDroitVoteTheorique}
          onChange={(e) => setNombreTotalDroitVoteTheorique(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="societe-total-dv-exercable">Nombre total de droits de vote exerçable émis</label>
        <input
          id="societe-total-dv-exercable"
          type="number"
          step="0.01"
          min="0"
          value={nombreTotalDroitVoteExercable}
          onChange={(e) => setNombreTotalDroitVoteExercable(e.target.value)}
        />
      </div>

      <button type="submit" className="btn btn-primary">
        Ajouter la société
      </button>
    </form>
  );
}
