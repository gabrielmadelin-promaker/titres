import { useState } from "react";
import type { Societe, Transaction } from "../types";
import { formatDate, formatMontant, formatPourcentage } from "../lib/format";
import { pourcentageGlobal, valorisationCourante } from "../lib/valorisation";

interface Props {
  societes: Societe[];
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onChangerValorisation: (id: string, valeur: number) => void;
}

export function SocietesTable({
  societes,
  transactions,
  onDelete,
  onChangerValorisation,
}: Props) {
  const [editionId, setEditionId] = useState<string | null>(null);

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
          <th title="Chaque tranche est repondérée par (valorisation actuelle ÷ valorisation à la date de la tranche) : une tranche ancienne, acquise moins cher, pèse davantage aujourd'hui.">
            % global cédé
          </th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {parNom.map((societe) => {
          const v = valorisationCourante(societe, transactions);
          const pctGlobal = pourcentageGlobal(societe, transactions);
          const enEdition = editionId === societe.id;

          return (
            <tr key={societe.id}>
              <td>{societe.nom}</td>
              <td className="num">
                {enEdition ? (
                  <ValorisationEditor
                    valeurInitiale={v.valeur}
                    onAnnuler={() => setEditionId(null)}
                    onValider={(valeur) => {
                      onChangerValorisation(societe.id, valeur);
                      setEditionId(null);
                    }}
                  />
                ) : (
                  formatMontant(v.valeur)
                )}
              </td>
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
              <td className={`num ${pctGlobal !== null && pctGlobal > 100 ? "warning" : ""}`}>
                {pctGlobal === null ? "—" : formatPourcentage(pctGlobal)}
              </td>
              <td className="actions">
                {!enEdition && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => setEditionId(societe.id)}
                  >
                    Modifier
                  </button>
                )}
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

interface ValorisationEditorProps {
  valeurInitiale: number | null;
  onValider: (valeur: number) => void;
  onAnnuler: () => void;
}

function ValorisationEditor({ valeurInitiale, onValider, onAnnuler }: ValorisationEditorProps) {
  const [valeur, setValeur] = useState(valeurInitiale?.toString() ?? "");

  function valider() {
    const nombre = Number(valeur);
    if (!valeur || Number.isNaN(nombre) || nombre <= 0) return;
    onValider(nombre);
  }

  return (
    <div className="inline-editor">
      <input
        type="number"
        min="0"
        step="1"
        autoFocus
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") valider();
          if (e.key === "Escape") onAnnuler();
        }}
      />
      <button type="button" className="btn btn-primary btn-small" onClick={valider}>
        OK
      </button>
      <button type="button" className="btn btn-secondary btn-small" onClick={onAnnuler}>
        Annuler
      </button>
    </div>
  );
}
