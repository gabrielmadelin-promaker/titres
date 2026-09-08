import { useMemo, useState } from "react";
import type { Societe, Transaction } from "../types";
import { formatPourcentage } from "../lib/format";
import { pourcentageGlobal } from "../lib/participations";
import { basculerTri, comparerValeurs, flecheTri, type EtatTri } from "../lib/tri";
import { exporterXlsx } from "../lib/xlsxExport";

interface Props {
  societes: Societe[];
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onTogglePrincipale: (id: string, principale: boolean) => void;
}

type Colonne = "nom" | "principale" | "pctCede";

export function SocietesTable({ societes, transactions, onDelete, onTogglePrincipale }: Props) {
  const [tri, setTri] = useState<EtatTri<Colonne>>({ colonne: "nom", sens: "asc" });

  const lignes = useMemo(
    () => societes.map((s) => ({ societe: s, pctCede: pourcentageGlobal(s.id, transactions) })),
    [societes, transactions],
  );

  const triees = useMemo(() => {
    const facteur = tri.sens === "asc" ? 1 : -1;
    const cle = (l: (typeof lignes)[number]): string | number => {
      switch (tri.colonne) {
        case "nom":
          return l.societe.nom;
        case "principale":
          return l.societe.principale ? 1 : 0;
        case "pctCede":
          return l.pctCede ?? -Infinity;
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
        Principale: l.societe.principale ? "Oui" : "Non",
        "% cédé": l.pctCede ?? "",
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
      <table className="table">
        <thead>
          <tr>
            <th className="th-tri" onClick={() => setTri(basculerTri(tri, "nom"))}>
              Société{flecheTri(tri, "nom")}
            </th>
            <th
              className="th-tri"
              onClick={() => setTri(basculerTri(tri, "principale"))}
              title="Boîte affichée dans l'arbre central de l'organigramme. Les sociétés non principales apparaissent groupées en actionnaires minoritaires."
            >
              Principale{flecheTri(tri, "principale")}
            </th>
            <th
              className="th-tri num"
              onClick={() => setTri(basculerTri(tri, "pctCede"))}
              title="Somme des pourcentages acquis lors de l'ensemble des transactions ciblant cette société."
            >
              % cédé{flecheTri(tri, "pctCede")}
            </th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {triees.map(({ societe, pctCede }) => (
            <tr key={societe.id}>
              <td>{societe.nom}</td>
              <td className="num">
                <input
                  type="checkbox"
                  checked={societe.principale}
                  onChange={(e) => onTogglePrincipale(societe.id, e.target.checked)}
                  aria-label={`${societe.nom} est une société principale`}
                />
              </td>
              <td className={`num ${pctCede !== null && pctCede > 100 ? "warning" : ""}`}>
                {pctCede === null ? "—" : formatPourcentage(pctCede)}
              </td>
              <td className="actions">
                <button type="button" className="btn btn-danger btn-small" onClick={() => onDelete(societe.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
