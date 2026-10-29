import { Fragment, useMemo, useState } from "react";
import type { HistoriqueTotalSociete, LigneActionsParType, Societe, TypeTitre } from "../../types";
import { formatDate, formatDecimal } from "../../utils/format";
import { basculerTri, comparerValeurs, flecheTri, type EtatTri } from "../../utils/tri";
import { exporterXlsx } from "../../utils/xlsxExport";
import { ActionsParTypeEditor } from "./ActionsParTypeEditor";

interface Props {
  societes: Societe[];
  historique: HistoriqueTotalSociete[];
  types: TypeTitre[];
  onAdd: (ligne: Omit<HistoriqueTotalSociete, "id">) => Promise<boolean>;
  onUpdate: (id: string, ligne: Omit<HistoriqueTotalSociete, "id">) => void;
  onDelete: (id: string) => void;
  /**
   * Quand renseigné, verrouille le panneau sur une seule société (usage
   * depuis l'onglet Sociétés, où l'historique d'une société s'affiche sous
   * sa propre ligne) : masque le sélecteur de société du formulaire, le
   * filtre et la colonne « Société », et ne liste que les lignes de cette
   * société.
   */
  societeIdVerrouille?: string;
}

type Colonne = "societe" | "dateEffet" | "totalActions" | "nombreTotalDroitVoteTheorique" | "nombreTotalDroitVoteExercable";

function champVide(): string {
  return "";
}

function totalActions(lignes: LigneActionsParType[]): number {
  return lignes.reduce((s, l) => s + l.quantite, 0);
}

interface ChampsFormulaireProps {
  societeId: string;
  setSocieteId: (v: string) => void;
  dateEffet: string;
  setDateEffet: (v: string) => void;
  actionsParType: LigneActionsParType[];
  setActionsParType: (v: LigneActionsParType[]) => void;
  nombreTotalDroitVoteTheorique: string;
  setNombreTotalDroitVoteTheorique: (v: string) => void;
  nombreTotalDroitVoteExercable: string;
  setNombreTotalDroitVoteExercable: (v: string) => void;
  societesTriees: Societe[];
  types: TypeTitre[];
  /** Société déjà connue (verrouillée) : le champ de sélection n'est pas affiché. */
  societeIdVerrouille?: string;
  idPrefix: string;
}

/** Champs communs au formulaire d'ajout et à la ligne d'édition (même structure que TransactionChampsFields). */
function ChampsFormulaire({
  societeId,
  setSocieteId,
  dateEffet,
  setDateEffet,
  actionsParType,
  setActionsParType,
  nombreTotalDroitVoteTheorique,
  setNombreTotalDroitVoteTheorique,
  nombreTotalDroitVoteExercable,
  setNombreTotalDroitVoteExercable,
  societesTriees,
  types,
  societeIdVerrouille,
  idPrefix,
}: ChampsFormulaireProps) {
  return (
    <>
      {!societeIdVerrouille && (
        <div className="form-field">
          <label>Société</label>
          <select value={societeId} onChange={(e) => setSocieteId(e.target.value)} required>
            <option value="">Choisir...</option>
            {societesTriees.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="form-field">
        <label>Date d'effet</label>
        <input type="date" value={dateEffet} onChange={(e) => setDateEffet(e.target.value)} required />
      </div>
      <ActionsParTypeEditor lignes={actionsParType} onChange={setActionsParType} types={types} idPrefix={idPrefix} />
      <div className="form-field">
        <label>Nombre total de droits de vote théorique émis</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={nombreTotalDroitVoteTheorique}
          onChange={(e) => setNombreTotalDroitVoteTheorique(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label>Nombre total de droits de vote exerçable émis</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={nombreTotalDroitVoteExercable}
          onChange={(e) => setNombreTotalDroitVoteExercable(e.target.value)}
        />
      </div>
    </>
  );
}

interface FormAjoutProps {
  societesTriees: Societe[];
  types: TypeTitre[];
  onAdd: (ligne: Omit<HistoriqueTotalSociete, "id">) => Promise<boolean>;
  societeIdVerrouille?: string;
  /**
   * Dernière ligne connue de la société verrouillée (la plus récente par
   * date d'effet), si elle existe : sert à préremplir ce formulaire — les
   * totaux changent rarement d'une date d'effet à l'autre, autant repartir
   * des dernières valeurs plutôt que d'un formulaire vide.
   */
  derniereLigne?: HistoriqueTotalSociete | null;
}

function FormAjout({ societesTriees, types, onAdd, societeIdVerrouille, derniereLigne }: FormAjoutProps) {
  const [societeId, setSocieteId] = useState(societeIdVerrouille ?? champVide());
  const [dateEffet, setDateEffet] = useState(champVide());
  const [actionsParType, setActionsParType] = useState<LigneActionsParType[]>(derniereLigne?.actionsParType ?? []);
  const [nombreTotalDroitVoteTheorique, setNombreTotalDroitVoteTheorique] = useState(
    derniereLigne?.nombreTotalDroitVoteTheorique?.toString() ?? champVide(),
  );
  const [nombreTotalDroitVoteExercable, setNombreTotalDroitVoteExercable] = useState(
    derniereLigne?.nombreTotalDroitVoteExercable?.toString() ?? champVide(),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!societeId || !dateEffet) return;
    const reussi = await onAdd({
      societeId,
      dateEffet,
      actionsParType: actionsParType.filter((l) => l.quantite !== 0),
      nombreTotalDroitVoteTheorique: nombreTotalDroitVoteTheorique ? Number(nombreTotalDroitVoteTheorique) : null,
      nombreTotalDroitVoteExercable: nombreTotalDroitVoteExercable ? Number(nombreTotalDroitVoteExercable) : null,
    });
    if (!reussi) return;
    // Seule la date est vidée : les valeurs viennent d'être confirmées comme
    // les dernières en vigueur, inutile de les faire ressaisir pour la ligne
    // suivante (cas fréquent : plusieurs dates d'effet à la suite, mêmes totaux).
    setDateEffet(champVide());
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <ChampsFormulaire
        societeId={societeId}
        setSocieteId={setSocieteId}
        dateEffet={dateEffet}
        setDateEffet={setDateEffet}
        actionsParType={actionsParType}
        setActionsParType={setActionsParType}
        nombreTotalDroitVoteTheorique={nombreTotalDroitVoteTheorique}
        setNombreTotalDroitVoteTheorique={setNombreTotalDroitVoteTheorique}
        nombreTotalDroitVoteExercable={nombreTotalDroitVoteExercable}
        setNombreTotalDroitVoteExercable={setNombreTotalDroitVoteExercable}
        societesTriees={societesTriees}
        types={types}
        societeIdVerrouille={societeIdVerrouille}
        idPrefix="totaux-ajout"
      />
      <button type="submit" className="btn btn-primary">
        Ajouter
      </button>
    </form>
  );
}

interface LigneEditionProps {
  ligne: HistoriqueTotalSociete;
  societesTriees: Societe[];
  types: TypeTitre[];
  onSave: (champs: Omit<HistoriqueTotalSociete, "id">) => void;
  onCancel: () => void;
  societeIdVerrouille?: string;
}

function LigneEdition({ ligne, societesTriees, types, onSave, onCancel, societeIdVerrouille }: LigneEditionProps) {
  const [societeId, setSocieteId] = useState(ligne.societeId);
  const [dateEffet, setDateEffet] = useState(ligne.dateEffet);
  const [actionsParType, setActionsParType] = useState<LigneActionsParType[]>(ligne.actionsParType);
  const [nombreTotalDroitVoteTheorique, setNombreTotalDroitVoteTheorique] = useState(
    ligne.nombreTotalDroitVoteTheorique?.toString() ?? "",
  );
  const [nombreTotalDroitVoteExercable, setNombreTotalDroitVoteExercable] = useState(
    ligne.nombreTotalDroitVoteExercable?.toString() ?? "",
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!societeId || !dateEffet) return;
    onSave({
      societeId,
      dateEffet,
      actionsParType: actionsParType.filter((l) => l.quantite !== 0),
      nombreTotalDroitVoteTheorique: nombreTotalDroitVoteTheorique ? Number(nombreTotalDroitVoteTheorique) : null,
      nombreTotalDroitVoteExercable: nombreTotalDroitVoteExercable ? Number(nombreTotalDroitVoteExercable) : null,
    });
  }

  return (
    <form className="form edit-row-form" onSubmit={handleSubmit}>
      <ChampsFormulaire
        societeId={societeId}
        setSocieteId={setSocieteId}
        dateEffet={dateEffet}
        setDateEffet={setDateEffet}
        actionsParType={actionsParType}
        setActionsParType={setActionsParType}
        nombreTotalDroitVoteTheorique={nombreTotalDroitVoteTheorique}
        setNombreTotalDroitVoteTheorique={setNombreTotalDroitVoteTheorique}
        nombreTotalDroitVoteExercable={nombreTotalDroitVoteExercable}
        setNombreTotalDroitVoteExercable={setNombreTotalDroitVoteExercable}
        societesTriees={societesTriees}
        types={types}
        societeIdVerrouille={societeIdVerrouille}
        idPrefix={`totaux-edit-${ligne.id}`}
      />
      <div className="edit-row-actions">
        <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="btn btn-primary btn-small">
          Enregistrer
        </button>
      </div>
    </form>
  );
}

export function HistoriqueTotauxPanel({ societes, historique, types, onAdd, onUpdate, onDelete, societeIdVerrouille }: Props) {
  const [tri, setTri] = useState<EtatTri<Colonne>>({ colonne: "societe", sens: "asc" });
  const [filtreSocieteId, setFiltreSocieteId] = useState("");
  const [ligneEditee, setLigneEditee] = useState<string | null>(null);

  const societesTriees = useMemo(() => [...societes].sort((a, b) => a.nom.localeCompare(b.nom, "fr")), [societes]);
  const nomParId = useMemo(() => new Map(societes.map((s) => [s.id, s.nom])), [societes]);
  const nomDe = (id: string) => nomParId.get(id) ?? "(supprimée)";

  const derniereLigne = useMemo(() => {
    if (!societeIdVerrouille) return null;
    const lignes = historique.filter((h) => h.societeId === societeIdVerrouille);
    if (lignes.length === 0) return null;
    return lignes.reduce((plusRecente, h) => (h.dateEffet > plusRecente.dateEffet ? h : plusRecente));
  }, [historique, societeIdVerrouille]);

  const filtreEffectif = societeIdVerrouille ?? filtreSocieteId;
  const filtrees = useMemo(
    () => historique.filter((h) => !filtreEffectif || h.societeId === filtreEffectif),
    [historique, filtreEffectif],
  );

  const triees = useMemo(() => {
    const facteur = tri.sens === "asc" ? 1 : -1;
    const cle = (h: HistoriqueTotalSociete): string | number => {
      switch (tri.colonne) {
        case "societe":
          return nomParId.get(h.societeId) ?? "(supprimée)";
        case "dateEffet":
          return h.dateEffet;
        case "totalActions":
          return totalActions(h.actionsParType);
        case "nombreTotalDroitVoteTheorique":
          return h.nombreTotalDroitVoteTheorique ?? -Infinity;
        case "nombreTotalDroitVoteExercable":
          return h.nombreTotalDroitVoteExercable ?? -Infinity;
      }
    };
    return [...filtrees].sort((a, b) => facteur * comparerValeurs(cle(a), cle(b)));
  }, [filtrees, tri, nomParId]);

  function exporter() {
    return exporterXlsx(
      "totaux-societes.xlsx",
      "Totaux",
      triees.map((h) => ({
        ...(societeIdVerrouille ? {} : { Société: nomDe(h.societeId) }),
        "Date d'effet": h.dateEffet,
        "Nombre total d'actions": totalActions(h.actionsParType) || "",
        "Détail par Catégorie": h.actionsParType.map((l) => `${l.type ?? "(non précisé)"} : ${l.quantite}`).join(", "),
        "Nombre total de droits de vote théorique": h.nombreTotalDroitVoteTheorique ?? "",
        "Nombre total de droits de vote exerçable": h.nombreTotalDroitVoteExercable ?? "",
      })),
    );
  }

  return (
    <div>
      <h3>Ajouter une ligne</h3>
      <FormAjout
        societesTriees={societesTriees}
        types={types}
        onAdd={onAdd}
        societeIdVerrouille={societeIdVerrouille}
        derniereLigne={derniereLigne}
      />

      <h3>Historique</h3>
      <div className="table-toolbar">
        <div className="table-filters">
          {!societeIdVerrouille && (
            <div className="form-field">
              <label htmlFor="totaux-filtre-societe">Société</label>
              <select id="totaux-filtre-societe" value={filtreSocieteId} onChange={(e) => setFiltreSocieteId(e.target.value)}>
                <option value="">Toutes</option>
                {societesTriees.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="viz-actions">
          <button type="button" className="btn btn-secondary btn-small" onClick={exporter}>
            Exporter en xlsx
          </button>
        </div>
      </div>

      {triees.length === 0 ? (
        <p className="empty">Aucune ligne d'historique pour le moment.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                {!societeIdVerrouille && (
                  <th className="th-tri" onClick={() => setTri(basculerTri(tri, "societe"))}>
                    Société{flecheTri(tri, "societe")}
                  </th>
                )}
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "dateEffet"))}>
                  Date d'effet{flecheTri(tri, "dateEffet")}
                </th>
                <th
                  className="th-tri num"
                  onClick={() => setTri(basculerTri(tri, "totalActions"))}
                  title="Somme des quantités par Catégorie."
                >
                  Total actions{flecheTri(tri, "totalActions")}
                </th>
                <th>Détail par Catégorie</th>
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "nombreTotalDroitVoteTheorique"))}>
                  Total DV théorique{flecheTri(tri, "nombreTotalDroitVoteTheorique")}
                </th>
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "nombreTotalDroitVoteExercable"))}>
                  Total DV exerçable{flecheTri(tri, "nombreTotalDroitVoteExercable")}
                </th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {triees.map((h) => (
                <Fragment key={h.id}>
                  <tr>
                    {!societeIdVerrouille && <td>{nomDe(h.societeId)}</td>}
                    <td>{formatDate(h.dateEffet)}</td>
                    <td className="num">{totalActions(h.actionsParType) === 0 ? "—" : formatDecimal(totalActions(h.actionsParType))}</td>
                    <td>
                      {h.actionsParType.length === 0
                        ? "—"
                        : h.actionsParType.map((l) => `${l.type ?? "(non précisé)"} : ${formatDecimal(l.quantite)}`).join(", ")}
                    </td>
                    <td className="num">
                      {h.nombreTotalDroitVoteTheorique === null ? "—" : formatDecimal(h.nombreTotalDroitVoteTheorique)}
                    </td>
                    <td className="num">
                      {h.nombreTotalDroitVoteExercable === null ? "—" : formatDecimal(h.nombreTotalDroitVoteExercable)}
                    </td>
                    <td className="actions">
                      <div className="actions-groupe">
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => setLigneEditee(ligneEditee === h.id ? null : h.id)}
                        >
                          Modifier
                        </button>
                        <button type="button" className="btn btn-danger btn-small" onClick={() => onDelete(h.id)}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                  {ligneEditee === h.id && (
                    <tr>
                      <td colSpan={societeIdVerrouille ? 6 : 7}>
                        <LigneEdition
                          ligne={h}
                          societesTriees={societesTriees}
                          types={types}
                          societeIdVerrouille={societeIdVerrouille}
                          onCancel={() => setLigneEditee(null)}
                          onSave={(champs) => {
                            onUpdate(h.id, champs);
                            setLigneEditee(null);
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
