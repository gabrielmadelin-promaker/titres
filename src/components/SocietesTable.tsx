import type { Societe, Transaction } from "../types";
import { formatDate, formatMontant } from "../lib/format";
import { valorisationCourante } from "../lib/valorisation";

interface Props {
  societes: Societe[];
  transactions: Transaction[];
  onDelete: (id: string) => void;
}

export function SocietesTable({ societes, transactions, onDelete }: Props) {
  if (societes.length === 0) {
    return <p className="empty">Aucune société pour le moment.</p>;
  }

  const parNom = [...societes].sort((a, b) => a.nom.localeCompare(b.nom));

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Société</th>
          <th>Valorisation actuelle</th>
          <th>Au</th>
          <th>Source</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {parNom.map((societe) => {
          const v = valorisationCourante(societe, transactions);
          return (
            <tr key={societe.id}>
              <td>{societe.nom}</td>
              <td className="num">{formatMontant(v.valeur)}</td>
              <td>{v.date ? formatDate(v.date) : "—"}</td>
              <td>
                {v.source === "transaction" && (
                  <span className="badge badge-transaction">transaction</span>
                )}
                {v.source === "manuelle" && (
                  <span className="badge badge-manuelle">manuelle</span>
                )}
                {v.source === "aucune" && <span className="badge">—</span>}
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  onClick={() => onDelete(societe.id)}
                >
                  Supprimer
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
