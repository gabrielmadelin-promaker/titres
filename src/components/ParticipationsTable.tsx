import { useMemo, useState } from "react";
import type { Societe, Transaction } from "../types";
import { formatPourcentage } from "../lib/format";
import { calculerParticipationsDetaillees, type ParticipationDetaillee } from "../lib/participations";
import { basculerTri, comparerValeurs, flecheTri, type EtatTri } from "../lib/tri";
import { exporterXlsx } from "../lib/xlsxExport";

interface Props {
  societes: Societe[];
  transactions: Transaction[];
}

type Colonne = "acheteur" | "cible" | "total" | "direct";

const SEUIL_ECART = 0.01;

export function ParticipationsTable({ societes, transactions }: Props) {
  const [tri, setTri] = useState<EtatTri<Colonne>>({ colonne: "acheteur", sens: "asc" });
  const [filtreActionnaireId, setFiltreActionnaireId] = useState("");
  const [filtreDetenueId, setFiltreDetenueId] = useState("");

  const nomParId = useMemo(() => new Map(societes.map((s) => [s.id, s.nom])), [societes]);
  const nomDe = (id: string) => nomParId.get(id) ?? "(supprimée)";
  const societesTriees = [...societes].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  const participations = useMemo(() => calculerParticipationsDetaillees(transactions), [transactions]);

  const filtrees = useMemo(
    () =>
      participations.filter(
        (p) =>
          (!filtreActionnaireId || p.acheteurId === filtreActionnaireId) &&
          (!filtreDetenueId || p.cibleId === filtreDetenueId),
      ),
    [participations, filtreActionnaireId, filtreDetenueId],
  );

  const triees = useMemo(() => {
    const facteur = tri.sens === "asc" ? 1 : -1;
    const cle = (p: ParticipationDetaillee): string | number => {
      switch (tri.colonne) {
        case "acheteur":
          return nomParId.get(p.acheteurId) ?? "(supprimée)";
        case "cible":
          return nomParId.get(p.cibleId) ?? "(supprimée)";
        case "total":
          return p.pourcentageTotal;
        case "direct":
          return p.pourcentageDirect;
      }
    };
    return [...filtrees].sort((a, b) => facteur * comparerValeurs(cle(a), cle(b)));
  }, [filtrees, tri, nomParId]);

  function exporter() {
    return exporterXlsx(
      "participations.xlsx",
      "Participations",
      triees.map((p) => ({
        Actionnaire: nomDe(p.acheteurId),
        "Société détenue": nomDe(p.cibleId),
        "% détenu (total)": p.pourcentageTotal,
        "dont % en direct": p.pourcentageDirect,
      })),
    );
  }

  if (participations.length === 0) {
    return <p className="empty">Aucune participation pour le moment.</p>;
  }

  return (
    <div>
      <div className="table-toolbar">
        <div className="table-filters">
          <div className="form-field">
            <label htmlFor="part-filtre-actionnaire">Actionnaire</label>
            <select
              id="part-filtre-actionnaire"
              value={filtreActionnaireId}
              onChange={(e) => setFiltreActionnaireId(e.target.value)}
            >
              <option value="">Tous</option>
              {societesTriees.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="part-filtre-detenue">Société détenue</label>
            <select
              id="part-filtre-detenue"
              value={filtreDetenueId}
              onChange={(e) => setFiltreDetenueId(e.target.value)}
            >
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
        <p className="empty">Aucune participation ne correspond à ce filtre.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th className="th-tri" onClick={() => setTri(basculerTri(tri, "acheteur"))}>
                Actionnaire{flecheTri(tri, "acheteur")}
              </th>
              <th className="th-tri" onClick={() => setTri(basculerTri(tri, "cible"))}>
                Société détenue{flecheTri(tri, "cible")}
              </th>
              <th
                className="th-tri num"
                onClick={() => setTri(basculerTri(tri, "total"))}
                title="Part totale détenue, directement et indirectement via les sociétés intermédiaires."
              >
                % détenu{flecheTri(tri, "total")}
              </th>
            </tr>
          </thead>
          <tbody>
            {triees.map((p) => {
              const ecart = Math.abs(p.pourcentageTotal - p.pourcentageDirect);
              const aDirect = Math.abs(p.pourcentageDirect) > SEUIL_ECART;
              return (
                <tr key={`${p.acheteurId}::${p.cibleId}`}>
                  <td>{nomDe(p.acheteurId)}</td>
                  <td>{nomDe(p.cibleId)}</td>
                  <td className="num">
                    {formatPourcentage(p.pourcentageTotal)}
                    {ecart > SEUIL_ECART && aDirect && (
                      <span className="participation-detail">dont {formatPourcentage(p.pourcentageDirect)} en direct</span>
                    )}
                    {ecart > SEUIL_ECART && !aDirect && (
                      <span className="badge" title="Aucune transaction directe entre ces deux sociétés : participation entièrement indirecte.">
                        indirect
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
