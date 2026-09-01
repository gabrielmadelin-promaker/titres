import type { Societe, Transaction } from "../types";
import { formatDate, formatMontant, formatPourcentage } from "../lib/format";

interface Props {
  transactions: Transaction[];
  societes: Societe[];
  onDelete: (id: string) => void;
}

export function TransactionsTable({ transactions, societes, onDelete }: Props) {
  if (transactions.length === 0) {
    return <p className="empty">Aucune transaction pour le moment.</p>;
  }

  const nomDe = (id: string) => societes.find((s) => s.id === id)?.nom ?? "(supprimée)";

  const triees = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Acheteur</th>
          <th>Cible</th>
          <th>%</th>
          <th>Valorisation cible</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {triees.map((t) => (
          <tr key={t.id}>
            <td>{formatDate(t.date)}</td>
            <td>{nomDe(t.acheteurId)}</td>
            <td>{nomDe(t.cibleId)}</td>
            <td className="num">{formatPourcentage(t.pourcentage)}</td>
            <td className="num">{formatMontant(t.valorisation)}</td>
            <td>
              <button
                type="button"
                className="btn btn-danger btn-small"
                onClick={() => onDelete(t.id)}
              >
                Supprimer
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
