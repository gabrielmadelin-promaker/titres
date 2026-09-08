import { useMemo, useState } from "react";
import type { Societe, Transaction } from "../types";
import { formatDate, formatDecimal, formatMontant, formatPourcentage } from "../lib/format";
import { basculerTri, comparerValeurs, flecheTri, type EtatTri } from "../lib/tri";
import { exporterXlsx } from "../lib/xlsxExport";

interface Props {
  transactions: Transaction[];
  societes: Societe[];
  onDelete: (id: string) => void;
}

type Colonne =
  | "date"
  | "acheteur"
  | "cible"
  | "vendeur"
  | "nombreActions"
  | "capital"
  | "dvTheorique"
  | "dvExercable"
  | "prixAction"
  | "qualification";

function formatOuTiret(valeur: number | null, formateur: (v: number) => string): string {
  return valeur === null ? "—" : formateur(valeur);
}

export function TransactionsTable({ transactions, societes, onDelete }: Props) {
  const [tri, setTri] = useState<EtatTri<Colonne>>({ colonne: "date", sens: "desc" });
  const [filtreAcheteurId, setFiltreAcheteurId] = useState("");
  const [filtreCibleId, setFiltreCibleId] = useState("");

  const nomParId = useMemo(() => new Map(societes.map((s) => [s.id, s.nom])), [societes]);
  const nomDe = (id: string | null) => (id ? (nomParId.get(id) ?? "(supprimée)") : "—");
  const societesTriees = [...societes].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  const filtrees = useMemo(
    () =>
      transactions.filter(
        (t) =>
          (!filtreAcheteurId || t.acheteurId === filtreAcheteurId) &&
          (!filtreCibleId || t.cibleId === filtreCibleId),
      ),
    [transactions, filtreAcheteurId, filtreCibleId],
  );

  const triees = useMemo(() => {
    const facteur = tri.sens === "asc" ? 1 : -1;
    const cle = (t: Transaction): string | number => {
      switch (tri.colonne) {
        case "date":
          return t.date;
        case "acheteur":
          return nomParId.get(t.acheteurId) ?? "(supprimée)";
        case "cible":
          return nomParId.get(t.cibleId) ?? "(supprimée)";
        case "vendeur":
          return t.vendeurId ? (nomParId.get(t.vendeurId) ?? "(supprimée)") : "";
        case "nombreActions":
          return t.nombreActions ?? -Infinity;
        case "capital":
          return t.capital;
        case "dvTheorique":
          return t.droitVoteTheorique ?? -Infinity;
        case "dvExercable":
          return t.droitVoteExercable ?? -Infinity;
        case "prixAction":
          return t.prixAction ?? -Infinity;
        case "qualification":
          return t.qualification;
      }
    };
    return [...filtrees].sort((a, b) => facteur * comparerValeurs(cle(a), cle(b)));
  }, [filtrees, tri, nomParId]);

  function exporter() {
    return exporterXlsx(
      "transactions.xlsx",
      "Transactions",
      triees.map((t) => ({
        Date: t.date,
        Acheteur: nomDe(t.acheteurId),
        Cible: nomDe(t.cibleId),
        Vendeur: nomDe(t.vendeurId),
        "Nombre d'actions": t.nombreActions ?? "",
        "Capital (%)": t.capital,
        "Droit de vote théorique (%)": t.droitVoteTheorique ?? "",
        "Droit de vote exerçable (%)": t.droitVoteExercable ?? "",
        "Prix de l'action (€)": t.prixAction ?? "",
        Qualification: t.qualification,
      })),
    );
  }

  if (transactions.length === 0) {
    return <p className="empty">Aucune transaction pour le moment.</p>;
  }

  return (
    <div>
      <div className="table-toolbar">
        <div className="table-filters">
          <div className="form-field">
            <label htmlFor="tx-filtre-acheteur">Acheteur</label>
            <select id="tx-filtre-acheteur" value={filtreAcheteurId} onChange={(e) => setFiltreAcheteurId(e.target.value)}>
              <option value="">Tous</option>
              {societesTriees.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="tx-filtre-cible">Cible</label>
            <select id="tx-filtre-cible" value={filtreCibleId} onChange={(e) => setFiltreCibleId(e.target.value)}>
              <option value="">Toutes</option>
              {societesTriees.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="viz-actions">
          <button type="button" className="btn btn-secondary btn-small" onClick={exporter}>
            Exporter en xlsx
          </button>
        </div>
      </div>

      {triees.length === 0 ? (
        <p className="empty">Aucune transaction ne correspond à ce filtre.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "date"))}>
                  Date{flecheTri(tri, "date")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "acheteur"))}>
                  Acheteur{flecheTri(tri, "acheteur")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "cible"))}>
                  Cible{flecheTri(tri, "cible")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "vendeur"))}>
                  Vendeur{flecheTri(tri, "vendeur")}
                </th>
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "nombreActions"))}>
                  Nombre d'actions{flecheTri(tri, "nombreActions")}
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
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "prixAction"))}>
                  Prix action{flecheTri(tri, "prixAction")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "qualification"))}>
                  Qualification{flecheTri(tri, "qualification")}
                </th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {triees.map((t) => (
                <tr key={t.id}>
                  <td>{formatDate(t.date)}</td>
                  <td>{nomDe(t.acheteurId)}</td>
                  <td>{nomDe(t.cibleId)}</td>
                  <td>{nomDe(t.vendeurId)}</td>
                  <td className="num">{formatOuTiret(t.nombreActions, formatDecimal)}</td>
                  <td className="num">{formatPourcentage(t.capital)}</td>
                  <td className="num">{formatOuTiret(t.droitVoteTheorique, formatPourcentage)}</td>
                  <td className="num">{formatOuTiret(t.droitVoteExercable, formatPourcentage)}</td>
                  <td className="num">{formatOuTiret(t.prixAction, formatMontant)}</td>
                  <td>{t.qualification}</td>
                  <td>
                    <button type="button" className="btn btn-danger btn-small" onClick={() => onDelete(t.id)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
