import type { Societe, Transaction } from "../types";
import { formatPourcentage } from "../lib/format";
import { pourcentageGlobal } from "../lib/participations";

interface Props {
  societes: Societe[];
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onTogglePrincipale: (id: string, principale: boolean) => void;
}

export function SocietesTable({ societes, transactions, onDelete, onTogglePrincipale }: Props) {
  if (societes.length === 0) {
    return <p className="empty">Aucune société pour le moment.</p>;
  }

  const parNom = [...societes].sort((a, b) => a.nom.localeCompare(b.nom));

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Société</th>
          <th
            title="Boîte affichée dans l'arbre central de l'organigramme. Les sociétés non principales apparaissent groupées en actionnaires minoritaires."
          >
            Principale
          </th>
          <th title="Somme des pourcentages acquis lors de l'ensemble des transactions ciblant cette société.">
            % cédé
          </th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {parNom.map((societe) => {
          const pctGlobal = pourcentageGlobal(societe.id, transactions);

          return (
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
              <td className={`num ${pctGlobal !== null && pctGlobal > 100 ? "warning" : ""}`}>
                {pctGlobal === null ? "—" : formatPourcentage(pctGlobal)}
              </td>
              <td className="actions">
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
