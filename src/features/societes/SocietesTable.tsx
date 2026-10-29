import { Fragment, useMemo, useState } from "react";
import type { HistoriqueTotalSociete, Societe, Transaction, TypeTitre } from "../../types";
import { formatDecimal, formatPourcentage } from "../../utils/format";
import { valeurGlobale } from "../../utils/participations";
import { PAYS } from "../../utils/pays";
import { basculerTri, comparerValeurs, flecheTri, type EtatTri } from "../../utils/tri";
import { exporterXlsx } from "../../utils/xlsxExport";
import { HistoriqueTotauxPanel } from "../totaux/HistoriqueTotauxPanel";

interface Props {
  societes: Societe[];
  historiqueTotaux: HistoriqueTotalSociete[];
  transactions: Transaction[];
  types: TypeTitre[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, champs: Omit<Societe, "id">) => void;
  onAddHistoriqueTotal: (ligne: Omit<HistoriqueTotalSociete, "id">) => Promise<boolean>;
  onUpdateHistoriqueTotal: (id: string, ligne: Omit<HistoriqueTotalSociete, "id">) => void;
  onDeleteHistoriqueTotal: (id: string) => void;
}

type Colonne =
  | "nom"
  | "valeurNominale"
  | "pays"
  | "siegeSocial"
  | "siren"
  | "lei"
  | "totalActions"
  | "capital"
  | "dvTheorique"
  | "dvExercable";

interface SocieteEditRowProps {
  societe: Societe;
  onSave: (champs: Omit<Societe, "id">) => void;
  onCancel: () => void;
}

function SocieteEditRow({ societe, onSave, onCancel }: SocieteEditRowProps) {
  const [nom, setNom] = useState(societe.nom);
  const [valeurNominale, setValeurNominale] = useState(societe.valeurNominale?.toString() ?? "");
  const [pays, setPays] = useState(societe.pays ?? "");
  const [siegeSocial, setSiegeSocial] = useState(societe.siegeSocial ?? "");
  const [siren, setSiren] = useState(societe.siren ?? "");
  const [lei, setLei] = useState(societe.lei ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nomPropre = nom.trim();
    if (!nomPropre) return;
    onSave({
      nom: nomPropre,
      valeurNominale: valeurNominale ? Number(valeurNominale) : null,
      pays: pays || null,
      siegeSocial: siegeSocial.trim() || null,
      siren: siren.trim() || null,
      lei: lei.trim() || null,
    });
  }

  return (
    <form className="form edit-row-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label>Nom</label>
        <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} required />
      </div>
      <div className="form-field">
        <label>Valeur nominale</label>
        <input
          type="number"
          step="0.0001"
          min="0"
          value={valeurNominale}
          onChange={(e) => setValeurNominale(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label>Pays</label>
        <select value={pays} onChange={(e) => setPays(e.target.value)}>
          <option value="">Non renseigné</option>
          {PAYS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label>Siège social</label>
        <input type="text" value={siegeSocial} onChange={(e) => setSiegeSocial(e.target.value)} />
      </div>
      <div className="form-field">
        <label>SIREN</label>
        <input type="text" value={siren} onChange={(e) => setSiren(e.target.value)} />
      </div>
      <div className="form-field">
        <label>LEI</label>
        <input type="text" value={lei} onChange={(e) => setLei(e.target.value)} />
      </div>
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

export function SocietesTable({
  societes,
  historiqueTotaux,
  transactions,
  types,
  onDelete,
  onUpdate,
  onAddHistoriqueTotal,
  onUpdateHistoriqueTotal,
  onDeleteHistoriqueTotal,
}: Props) {
  const [tri, setTri] = useState<EtatTri<Colonne>>({ colonne: "nom", sens: "asc" });
  const [ligneEditee, setLigneEditee] = useState<string | null>(null);
  const [totauxOuverts, setTotauxOuverts] = useState<string | null>(null);

  const lignes = useMemo(
    () =>
      societes.map((s) => ({
        societe: s,
        totalActions: valeurGlobale(s.id, transactions, "nombreActions", historiqueTotaux),
        capital: valeurGlobale(s.id, transactions, "capital", historiqueTotaux),
        dvTheorique: valeurGlobale(s.id, transactions, "droitVoteTheorique", historiqueTotaux),
        dvExercable: valeurGlobale(s.id, transactions, "droitVoteExercable", historiqueTotaux),
      })),
    [societes, transactions, historiqueTotaux],
  );

  const triees = useMemo(() => {
    const facteur = tri.sens === "asc" ? 1 : -1;
    const cle = (l: (typeof lignes)[number]): string | number => {
      switch (tri.colonne) {
        case "nom":
          return l.societe.nom;
        case "valeurNominale":
          return l.societe.valeurNominale ?? -Infinity;
        case "pays":
          return l.societe.pays ?? "";
        case "siegeSocial":
          return l.societe.siegeSocial ?? "";
        case "siren":
          return l.societe.siren ?? "";
        case "lei":
          return l.societe.lei ?? "";
        case "totalActions":
          return l.totalActions ?? -Infinity;
        case "capital":
          return l.capital ?? -Infinity;
        case "dvTheorique":
          return l.dvTheorique ?? -Infinity;
        case "dvExercable":
          return l.dvExercable ?? -Infinity;
      }
    };
    return [...lignes].sort((a, b) => facteur * comparerValeurs(cle(a), cle(b)));
  }, [lignes, tri]);

  function exporter() {
    return exporterXlsx(
      "societes.xlsx",
      "Sociétés",
      triees.map((l) => ({
        Société: l.societe.nom,
        "Valeur nominale": l.societe.valeurNominale ?? "",
        Pays: l.societe.pays ?? "",
        "Siège social": l.societe.siegeSocial ?? "",
        SIREN: l.societe.siren ?? "",
        LEI: l.societe.lei ?? "",
        "Total nombre d'actions": l.totalActions ?? "",
        "Capital (%)": l.capital ?? "",
        "Droit de vote théorique (%)": l.dvTheorique ?? "",
        "Droit de vote exerçable (%)": l.dvExercable ?? "",
      })),
    );
  }

  if (societes.length === 0) {
    return <p className="empty">Aucune société pour le moment.</p>;
  }

  return (
    <div>
      <div className="table-toolbar">
        <div />
        <div className="viz-actions">
          <button type="button" className="btn btn-secondary btn-small" onClick={exporter}>
            Exporter en xlsx
          </button>
        </div>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th className="th-tri" onClick={() => setTri(basculerTri(tri, "nom"))}>
                Société{flecheTri(tri, "nom")}
              </th>
              <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "valeurNominale"))}>
                Valeur nominale{flecheTri(tri, "valeurNominale")}
              </th>
              <th className="th-tri" onClick={() => setTri(basculerTri(tri, "pays"))}>
                Pays{flecheTri(tri, "pays")}
              </th>
              <th className="th-tri" onClick={() => setTri(basculerTri(tri, "siegeSocial"))}>
                Siège social{flecheTri(tri, "siegeSocial")}
              </th>
              <th className="th-tri" onClick={() => setTri(basculerTri(tri, "siren"))}>
                SIREN{flecheTri(tri, "siren")}
              </th>
              <th className="th-tri" onClick={() => setTri(basculerTri(tri, "lei"))}>
                LEI{flecheTri(tri, "lei")}
              </th>
              <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "totalActions"))}>
                Total actions{flecheTri(tri, "totalActions")}
              </th>
              <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "capital"))}>
                Capital %{flecheTri(tri, "capital")}
              </th>
              <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "dvTheorique"))}>
                DV théorique %{flecheTri(tri, "dvTheorique")}
              </th>
              <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "dvExercable"))}>
                DV exerçable %{flecheTri(tri, "dvExercable")}
              </th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {triees.map(({ societe, totalActions, capital, dvTheorique, dvExercable }) => (
              <Fragment key={societe.id}>
                <tr>
                  <td>{societe.nom}</td>
                  <td className="num">{societe.valeurNominale === null ? "—" : formatDecimal(societe.valeurNominale)}</td>
                  <td>{societe.pays ?? "—"}</td>
                  <td>{societe.siegeSocial ?? "—"}</td>
                  <td>{societe.siren ?? "—"}</td>
                  <td>{societe.lei ?? "—"}</td>
                  <td className="num">{totalActions === null ? "—" : formatDecimal(totalActions)}</td>
                  <td className={`num ${capital !== null && capital > 100 ? "warning" : ""}`}>
                    {capital === null ? "—" : formatPourcentage(capital)}
                  </td>
                  <td className="num">{dvTheorique === null ? "—" : formatPourcentage(dvTheorique)}</td>
                  <td className="num">{dvExercable === null ? "—" : formatPourcentage(dvExercable)}</td>
                  <td className="actions">
                    <div className="actions-groupe">
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => setTotauxOuverts(totauxOuverts === societe.id ? null : societe.id)}
                      >
                        Totaux
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => setLigneEditee(ligneEditee === societe.id ? null : societe.id)}
                      >
                        Modifier
                      </button>
                      <button type="button" className="btn btn-danger btn-small" onClick={() => onDelete(societe.id)}>
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
                {ligneEditee === societe.id && (
                  <tr>
                    <td colSpan={11}>
                      <SocieteEditRow
                        societe={societe}
                        onCancel={() => setLigneEditee(null)}
                        onSave={(champs) => {
                          onUpdate(societe.id, champs);
                          setLigneEditee(null);
                        }}
                      />
                    </td>
                  </tr>
                )}
                {totauxOuverts === societe.id && (
                  <tr>
                    <td colSpan={11}>
                      <HistoriqueTotauxPanel
                        societes={societes}
                        historique={historiqueTotaux}
                        types={types}
                        societeIdVerrouille={societe.id}
                        onAdd={onAddHistoriqueTotal}
                        onUpdate={onUpdateHistoriqueTotal}
                        onDelete={onDeleteHistoriqueTotal}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
