import { Fragment, useMemo, useState } from "react";
import type { HistoriqueTotalSociete, Societe } from "../types";
import { formatDate, formatDecimal } from "../lib/format";
import { basculerTri, comparerValeurs, flecheTri, type EtatTri } from "../lib/tri";
import { exporterXlsx } from "../lib/xlsxExport";

interface Props {
  societes: Societe[];
  historique: HistoriqueTotalSociete[];
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

type Colonne = "societe" | "dateEffet" | "nombreTotalActions" | "nombreTotalDroitVoteTheorique" | "nombreTotalDroitVoteExercable";

function champVide(): string {
  return "";
}

interface ChampsFormulaireProps {
  societeId: string;
  setSocieteId: (v: string) => void;
  dateEffet: string;
  setDateEffet: (v: string) => void;
  nombreTotalActions: string;
  setNombreTotalActions: (v: string) => void;
  nombreTotalDroitVoteTheorique: string;
  setNombreTotalDroitVoteTheorique: (v: string) => void;
  nombreTotalDroitVoteExercable: string;
  setNombreTotalDroitVoteExercable: (v: string) => void;
  societesTriees: Societe[];
  /** Société déjà connue (verrouillée) : le champ de sélection n'est pas affiché. */
  societeIdVerrouille?: string;
}

/** Champs communs au formulaire d'ajout et à la ligne d'édition (même structure que TransactionChampsFields). */
function ChampsFormulaire({
  societeId,
  setSocieteId,
  dateEffet,
  setDateEffet,
  nombreTotalActions,
  setNombreTotalActions,
  nombreTotalDroitVoteTheorique,
  setNombreTotalDroitVoteTheorique,
  nombreTotalDroitVoteExercable,
  setNombreTotalDroitVoteExercable,
  societesTriees,
  societeIdVerrouille,
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
      <div className="form-field">
        <label>Nombre total d'actions émises</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={nombreTotalActions}
          onChange={(e) => setNombreTotalActions(e.target.value)}
        />
      </div>
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
  onAdd: (ligne: Omit<HistoriqueTotalSociete, "id">) => Promise<boolean>;
  societeIdVerrouille?: string;
}

function FormAjout({ societesTriees, onAdd, societeIdVerrouille }: FormAjoutProps) {
  const [societeId, setSocieteId] = useState(societeIdVerrouille ?? champVide());
  const [dateEffet, setDateEffet] = useState(champVide());
  const [nombreTotalActions, setNombreTotalActions] = useState(champVide());
  const [nombreTotalDroitVoteTheorique, setNombreTotalDroitVoteTheorique] = useState(champVide());
  const [nombreTotalDroitVoteExercable, setNombreTotalDroitVoteExercable] = useState(champVide());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!societeId || !dateEffet) return;
    const reussi = await onAdd({
      societeId,
      dateEffet,
      nombreTotalActions: nombreTotalActions ? Number(nombreTotalActions) : null,
      nombreTotalDroitVoteTheorique: nombreTotalDroitVoteTheorique ? Number(nombreTotalDroitVoteTheorique) : null,
      nombreTotalDroitVoteExercable: nombreTotalDroitVoteExercable ? Number(nombreTotalDroitVoteExercable) : null,
    });
    if (!reussi) return;
    setSocieteId(societeIdVerrouille ?? champVide());
    setDateEffet(champVide());
    setNombreTotalActions(champVide());
    setNombreTotalDroitVoteTheorique(champVide());
    setNombreTotalDroitVoteExercable(champVide());
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <ChampsFormulaire
        societeId={societeId}
        setSocieteId={setSocieteId}
        dateEffet={dateEffet}
        setDateEffet={setDateEffet}
        nombreTotalActions={nombreTotalActions}
        setNombreTotalActions={setNombreTotalActions}
        nombreTotalDroitVoteTheorique={nombreTotalDroitVoteTheorique}
        setNombreTotalDroitVoteTheorique={setNombreTotalDroitVoteTheorique}
        nombreTotalDroitVoteExercable={nombreTotalDroitVoteExercable}
        setNombreTotalDroitVoteExercable={setNombreTotalDroitVoteExercable}
        societesTriees={societesTriees}
        societeIdVerrouille={societeIdVerrouille}
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
  onSave: (champs: Omit<HistoriqueTotalSociete, "id">) => void;
  onCancel: () => void;
  societeIdVerrouille?: string;
}

function LigneEdition({ ligne, societesTriees, onSave, onCancel, societeIdVerrouille }: LigneEditionProps) {
  const [societeId, setSocieteId] = useState(ligne.societeId);
  const [dateEffet, setDateEffet] = useState(ligne.dateEffet);
  const [nombreTotalActions, setNombreTotalActions] = useState(ligne.nombreTotalActions?.toString() ?? "");
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
      nombreTotalActions: nombreTotalActions ? Number(nombreTotalActions) : null,
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
        nombreTotalActions={nombreTotalActions}
        setNombreTotalActions={setNombreTotalActions}
        nombreTotalDroitVoteTheorique={nombreTotalDroitVoteTheorique}
        setNombreTotalDroitVoteTheorique={setNombreTotalDroitVoteTheorique}
        nombreTotalDroitVoteExercable={nombreTotalDroitVoteExercable}
        setNombreTotalDroitVoteExercable={setNombreTotalDroitVoteExercable}
        societesTriees={societesTriees}
        societeIdVerrouille={societeIdVerrouille}
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

export function HistoriqueTotauxPanel({ societes, historique, onAdd, onUpdate, onDelete, societeIdVerrouille }: Props) {
  const [tri, setTri] = useState<EtatTri<Colonne>>({ colonne: "societe", sens: "asc" });
  const [filtreSocieteId, setFiltreSocieteId] = useState("");
  const [ligneEditee, setLigneEditee] = useState<string | null>(null);

  const societesTriees = useMemo(() => [...societes].sort((a, b) => a.nom.localeCompare(b.nom, "fr")), [societes]);
  const nomParId = useMemo(() => new Map(societes.map((s) => [s.id, s.nom])), [societes]);
  const nomDe = (id: string) => nomParId.get(id) ?? "(supprimée)";

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
        case "nombreTotalActions":
          return h.nombreTotalActions ?? -Infinity;
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
        "Nombre total d'actions": h.nombreTotalActions ?? "",
        "Nombre total de droits de vote théorique": h.nombreTotalDroitVoteTheorique ?? "",
        "Nombre total de droits de vote exerçable": h.nombreTotalDroitVoteExercable ?? "",
      })),
    );
  }

  return (
    <div>
      <h3>Ajouter une ligne</h3>
      <FormAjout societesTriees={societesTriees} onAdd={onAdd} societeIdVerrouille={societeIdVerrouille} />

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
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "nombreTotalActions"))}>
                  Total actions{flecheTri(tri, "nombreTotalActions")}
                </th>
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
                    <td className="num">{h.nombreTotalActions === null ? "—" : formatDecimal(h.nombreTotalActions)}</td>
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
                      <td colSpan={societeIdVerrouille ? 5 : 6}>
                        <LigneEdition
                          ligne={h}
                          societesTriees={societesTriees}
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
