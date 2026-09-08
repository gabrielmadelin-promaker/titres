import { Fragment, useMemo, useState } from "react";
import type { Societe, Transaction } from "../types";
import { formatPourcentage } from "../lib/format";
import { calculerCheminsParticipation, calculerParticipationsDetaillees, type ParticipationDetaillee } from "../lib/participations";
import { basculerTri, comparerValeurs, flecheTri, type EtatTri } from "../lib/tri";
import { exporterXlsx } from "../lib/xlsxExport";

interface Props {
  societes: Societe[];
  transactions: Transaction[];
}

type Colonne = "acheteur" | "cible" | "total" | "direct";

const SEUIL_ECART = 0.01;
const MAX_CHEMINS_AFFICHES = 15;

interface DetailCheminsProps {
  transactions: Transaction[];
  acheteurId: string;
  cibleId: string;
  nomDe: (id: string) => string;
}

/** Cascade des chemins de détention (direct + indirects) qui composent un "% détenu" total. */
function DetailChemins({ transactions, acheteurId, cibleId, nomDe }: DetailCheminsProps) {
  const chemins = useMemo(
    () => calculerCheminsParticipation(transactions, acheteurId, cibleId),
    [transactions, acheteurId, cibleId],
  );
  const affiches = chemins.slice(0, MAX_CHEMINS_AFFICHES);
  const reste = chemins.slice(MAX_CHEMINS_AFFICHES);
  const resteTotal = reste.reduce((s, c) => s + c.contribution, 0);

  return (
    <div className="chemins-detail">
      <p className="chemins-titre">
        Cascade des {chemins.length} chemin{chemins.length > 1 ? "s" : ""} de détention {nomDe(acheteurId)} →{" "}
        {nomDe(cibleId)} :
      </p>
      <ul className="chemins-liste">
        {affiches.map((chemin, i) => (
          <li key={i} className="chemins-ligne">
            <span className="chemins-chaine">
              {chemin.societeIds.map((id, j) => (
                <span key={id}>
                  {j > 0 && <span className="chemins-fleche"> → </span>}
                  {nomDe(id)}
                  {j < chemin.pourcentages.length && (
                    <span className="chemins-pct"> ({formatPourcentage(chemin.pourcentages[j])})</span>
                  )}
                </span>
              ))}
            </span>
            <span className="chemins-contribution">= {formatPourcentage(chemin.contribution)}</span>
          </li>
        ))}
      </ul>
      {reste.length > 0 && (
        <p className="chemins-reste">
          + {reste.length} autre{reste.length > 1 ? "s" : ""} chemin{reste.length > 1 ? "s" : ""} plus mineur
          {reste.length > 1 ? "s" : ""}, {formatPourcentage(resteTotal)} au total.
        </p>
      )}
    </div>
  );
}

export function ParticipationsTable({ societes, transactions }: Props) {
  const [tri, setTri] = useState<EtatTri<Colonne>>({ colonne: "acheteur", sens: "asc" });
  const [filtreActionnaireId, setFiltreActionnaireId] = useState("");
  const [filtreDetenueId, setFiltreDetenueId] = useState("");
  const [ligneOuverte, setLigneOuverte] = useState<string | null>(null);

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
              <th aria-label="Détail" />
            </tr>
          </thead>
          <tbody>
            {triees.map((p) => {
              const cle = `${p.acheteurId}::${p.cibleId}`;
              const ecart = Math.abs(p.pourcentageTotal - p.pourcentageDirect);
              const aDirect = Math.abs(p.pourcentageDirect) > SEUIL_ECART;
              const aIndirect = ecart > SEUIL_ECART;
              const ouverte = ligneOuverte === cle;
              return (
                <Fragment key={cle}>
                  <tr>
                    <td>{nomDe(p.acheteurId)}</td>
                    <td>{nomDe(p.cibleId)}</td>
                    <td className="num">
                      {formatPourcentage(p.pourcentageTotal)}
                      {aIndirect && aDirect && (
                        <span className="participation-detail">dont {formatPourcentage(p.pourcentageDirect)} en direct</span>
                      )}
                      {aIndirect && !aDirect && (
                        <span className="badge" title="Aucune transaction directe entre ces deux sociétés : participation entièrement indirecte.">
                          indirect
                        </span>
                      )}
                    </td>
                    <td className="actions">
                      {aIndirect && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => setLigneOuverte(ouverte ? null : cle)}
                        >
                          {ouverte ? "Masquer" : "Voir la cascade"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {ouverte && (
                    <tr>
                      <td colSpan={4}>
                        <DetailChemins
                          transactions={transactions}
                          acheteurId={p.acheteurId}
                          cibleId={p.cibleId}
                          nomDe={nomDe}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
