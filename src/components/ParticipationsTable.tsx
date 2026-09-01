import type { Societe, Transaction } from "../types";
import { formatDate, formatMontant, formatPourcentage } from "../lib/format";
import { calculerParticipations } from "../lib/participations";

interface Props {
  societes: Societe[];
  transactions: Transaction[];
}

export function ParticipationsTable({ societes, transactions }: Props) {
  const participations = calculerParticipations(transactions, societes);

  if (participations.length === 0) {
    return <p className="empty">Aucune participation pour le moment.</p>;
  }

  const nomDe = (id: string) => societes.find((s) => s.id === id)?.nom ?? "(supprimée)";

  const triees = [...participations].sort((a, b) => {
    const parActionnaire = nomDe(a.acheteurId).localeCompare(nomDe(b.acheteurId));
    return parActionnaire !== 0 ? parActionnaire : nomDe(a.cibleId).localeCompare(nomDe(b.cibleId));
  });

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Actionnaire</th>
          <th>Société détenue</th>
          <th title="Chaque tranche est repondérée par (valorisation actuelle de la cible ÷ valorisation de la tranche).">
            % détenu
          </th>
          <th>Valorisation retenue</th>
          <th>Au</th>
        </tr>
      </thead>
      <tbody>
        {triees.map((p) => (
          <tr key={`${p.acheteurId}::${p.cibleId}`}>
            <td>{nomDe(p.acheteurId)}</td>
            <td>{nomDe(p.cibleId)}</td>
            <td className="num">
              {formatPourcentage(p.pourcentageTotal)}
              {p.nombreTransactions > 1 && (
                <span className="badge" title={`${p.nombreTransactions} transactions cumulées`}>
                  {p.nombreTransactions}×
                </span>
              )}
            </td>
            <td className="num">{formatMontant(p.valorisationRetenue)}</td>
            <td>{p.dateValorisationRetenue ? formatDate(p.dateValorisationRetenue) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
