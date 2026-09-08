import { Fragment, useMemo, useState } from "react";
import type { Societe, Transaction } from "../types";
import { formatDecimal, formatPourcentage } from "../lib/format";
import {
  calculerCheminsParticipation,
  calculerParticipationsDetaillees,
  type Metrique,
  type ParticipationDetaillee,
} from "../lib/participations";
import { basculerTri, comparerValeurs, flecheTri, type EtatTri } from "../lib/tri";
import { exporterXlsx } from "../lib/xlsxExport";

interface Props {
  societes: Societe[];
  transactions: Transaction[];
}

interface GroupeMetrique {
  metrique: Metrique;
  libelle: string;
  chainable: boolean;
  formatValeur: (v: number) => string;
}

const GROUPES: GroupeMetrique[] = [
  { metrique: "nombreActions", libelle: "Nombre d'actions", chainable: false, formatValeur: formatDecimal },
  { metrique: "capital", libelle: "Capital (%)", chainable: true, formatValeur: formatPourcentage },
  {
    metrique: "droitVoteTheorique",
    libelle: "Droit de vote théorique (%)",
    chainable: true,
    formatValeur: formatPourcentage,
  },
  {
    metrique: "droitVoteExercable",
    libelle: "Droit de vote exerçable (%)",
    chainable: true,
    formatValeur: formatPourcentage,
  },
];

type Colonne = "acheteur" | "cible" | `total_${Metrique}`;

const SEUIL_ECART = 0.01;
const MAX_CHEMINS_AFFICHES = 8;

interface DetailCheminsProps {
  transactions: Transaction[];
  acheteurId: string;
  cibleId: string;
  metrique: Metrique;
  formatValeur: (v: number) => string;
  nomDe: (id: string) => string;
}

/** Cascade des chemins de détention (direct + indirects) qui composent la valeur totale d'une métrique. */
function DetailChemins({ transactions, acheteurId, cibleId, metrique, formatValeur, nomDe }: DetailCheminsProps) {
  const chemins = useMemo(
    () => calculerCheminsParticipation(transactions, acheteurId, cibleId, metrique),
    [transactions, acheteurId, cibleId, metrique],
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
                <span key={id} className="chemins-segment">
                  {j > 0 && <span className="chemins-fleche"> → </span>}
                  {nomDe(id)}
                  {j < chemin.valeurs.length && <span className="chemins-pct"> ({formatValeur(chemin.valeurs[j])})</span>}
                </span>
              ))}
            </span>
            <span className="chemins-contribution">= {formatValeur(chemin.contribution)}</span>
          </li>
        ))}
      </ul>
      {reste.length > 0 && (
        <p className="chemins-reste">
          + {reste.length} autre{reste.length > 1 ? "s" : ""} chemin{reste.length > 1 ? "s" : ""} plus mineur
          {reste.length > 1 ? "s" : ""}, {formatValeur(resteTotal)} au total.
        </p>
      )}
    </div>
  );
}

export function ParticipationsTable({ societes, transactions }: Props) {
  const [tri, setTri] = useState<EtatTri<Colonne>>({ colonne: "acheteur", sens: "asc" });
  const [filtreActionnaireId, setFiltreActionnaireId] = useState("");
  const [filtreDetenueId, setFiltreDetenueId] = useState("");
  const [ouvert, setOuvert] = useState<{ cle: string; metrique: Metrique } | null>(null);

  const nomParId = useMemo(() => new Map(societes.map((s) => [s.id, s.nom])), [societes]);
  const nomDe = (id: string) => nomParId.get(id) ?? "(supprimée)";
  const societesTriees = [...societes].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  const parMetrique = useMemo(() => {
    const map = new Map<Metrique, Map<string, ParticipationDetaillee>>();
    for (const g of GROUPES) {
      const detail = calculerParticipationsDetaillees(transactions, g.metrique);
      map.set(g.metrique, new Map(detail.map((d) => [`${d.acheteurId}::${d.cibleId}`, d])));
    }
    return map;
  }, [transactions]);

  // La liste des couples (actionnaire, cible) à afficher est l'union de ce
  // que chaque métrique a pu produire — une métrique facultative (nombre
  // d'actions, droits de vote) peut être renseignée sur des transactions où
  // une autre ne l'est pas. L'ordre de cette union dépend de l'ordre interne
  // (non significatif) de chaque calcul ; on le fige tout de suite par nom
  // pour que le tableau ait un ordre stable même avant tout tri utilisateur
  // — sinon des lignes de même actionnaire pouvaient sembler "remonter" de
  // façon apparemment aléatoire d'un rendu à l'autre.
  const lignesBase = useMemo(() => {
    const cles = new Set<string>();
    parMetrique.forEach((map) => map.forEach((_, cle) => cles.add(cle)));
    const lignes = [...cles].map((cle) => {
      const [acheteurId, cibleId] = cle.split("::");
      return { cle, acheteurId, cibleId };
    });
    const nomOuId = (id: string) => nomParId.get(id) ?? "(supprimée)";
    lignes.sort((a, b) => {
      const parActionnaire = comparerValeurs(nomOuId(a.acheteurId), nomOuId(b.acheteurId));
      return parActionnaire !== 0 ? parActionnaire : comparerValeurs(nomOuId(a.cibleId), nomOuId(b.cibleId));
    });
    return lignes;
  }, [parMetrique, nomParId]);

  const filtrees = useMemo(
    () =>
      lignesBase.filter(
        (p) =>
          (!filtreActionnaireId || p.acheteurId === filtreActionnaireId) &&
          (!filtreDetenueId || p.cibleId === filtreDetenueId),
      ),
    [lignesBase, filtreActionnaireId, filtreDetenueId],
  );

  const triees = useMemo(() => {
    const facteur = tri.sens === "asc" ? 1 : -1;
    const cle = (p: (typeof lignesBase)[number]): string | number => {
      if (tri.colonne === "acheteur") return nomParId.get(p.acheteurId) ?? "(supprimée)";
      if (tri.colonne === "cible") return nomParId.get(p.cibleId) ?? "(supprimée)";
      const metrique = tri.colonne.slice("total_".length) as Metrique;
      return parMetrique.get(metrique)?.get(p.cle)?.valeurTotale ?? -Infinity;
    };
    return [...filtrees].sort((a, b) => facteur * comparerValeurs(cle(a), cle(b)));
  }, [filtrees, tri, nomParId, parMetrique]);

  function exporter() {
    return exporterXlsx(
      "participations.xlsx",
      "Participations",
      triees.map((p) => {
        const ligne: Record<string, string | number> = {
          Actionnaire: nomDe(p.acheteurId),
          "Société détenue": nomDe(p.cibleId),
        };
        for (const g of GROUPES) {
          const d = parMetrique.get(g.metrique)?.get(p.cle);
          ligne[`${g.libelle} — total`] = d?.valeurTotale ?? "";
          ligne[`${g.libelle} — direct`] = d?.valeurDirecte ?? "";
        }
        return ligne;
      }),
    );
  }

  if (lignesBase.length === 0) {
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
        <div className="table-scroll">
          <table className="table table-participations">
            <thead>
              <tr className="table-group-header">
                <th
                  rowSpan={2}
                  className="th-tri"
                  onClick={() => setTri(basculerTri(tri, "acheteur"))}
                  style={{ background: "var(--panel-bg)" }}
                >
                  Actionnaire{flecheTri(tri, "acheteur")}
                </th>
                <th
                  rowSpan={2}
                  className="th-tri"
                  onClick={() => setTri(basculerTri(tri, "cible"))}
                  style={{ background: "var(--panel-bg)" }}
                >
                  Société détenue{flecheTri(tri, "cible")}
                </th>
                {GROUPES.map((g, i) => (
                  <th key={g.metrique} colSpan={4} className={`groupe-metrique groupe-metrique-${i % 2}`}>
                    {g.libelle}
                  </th>
                ))}
              </tr>
              <tr>
                {GROUPES.map((g, i) => (
                  <Fragment key={g.metrique}>
                    <th
                      className={`th-tri num groupe-metrique groupe-metrique-${i % 2} groupe-metrique-debut`}
                      onClick={() => setTri(basculerTri(tri, `total_${g.metrique}` as Colonne))}
                      title="Total détenu, directement et indirectement via les sociétés intermédiaires."
                    >
                      Total{flecheTri(tri, `total_${g.metrique}` as Colonne)}
                    </th>
                    <th className={`num groupe-metrique groupe-metrique-${i % 2}`}>Direct</th>
                    <th className={`num groupe-metrique groupe-metrique-${i % 2}`}>Indirect</th>
                    <th aria-label="Détail" className={`groupe-metrique groupe-metrique-${i % 2}`} />
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {triees.map((p) => (
                <Fragment key={p.cle}>
                  <tr>
                    <td>{nomDe(p.acheteurId)}</td>
                    <td>{nomDe(p.cibleId)}</td>
                    {GROUPES.map((g, i) => {
                      const d = parMetrique.get(g.metrique)?.get(p.cle);
                      const total = d?.valeurTotale ?? null;
                      const direct = d?.valeurDirecte ?? null;
                      const indirect = g.chainable && total !== null && direct !== null ? total - direct : null;
                      const aIndirect = indirect !== null && Math.abs(indirect) > SEUIL_ECART;
                      const estOuverte = ouvert?.cle === p.cle && ouvert.metrique === g.metrique;
                      const classeGroupe = `groupe-metrique groupe-metrique-${i % 2}`;
                      return (
                        <Fragment key={g.metrique}>
                          <td className={`num ${classeGroupe} groupe-metrique-debut`}>
                            {total === null ? "—" : g.formatValeur(total)}
                          </td>
                          <td className={`num valeur-secondaire ${classeGroupe}`}>
                            {direct === null ? "—" : g.formatValeur(direct)}
                          </td>
                          <td className={`num valeur-secondaire ${classeGroupe}`}>
                            {indirect === null ? "—" : g.formatValeur(indirect)}
                          </td>
                          <td className={`actions ${classeGroupe}`}>
                            {aIndirect && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-small"
                                onClick={() => setOuvert(estOuverte ? null : { cle: p.cle, metrique: g.metrique })}
                              >
                                {estOuverte ? "Masquer" : "Cascade"}
                              </button>
                            )}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                  {ouvert?.cle === p.cle && (
                    <tr>
                      <td colSpan={2 + GROUPES.length * 4}>
                        <DetailChemins
                          transactions={transactions}
                          acheteurId={p.acheteurId}
                          cibleId={p.cibleId}
                          metrique={ouvert.metrique}
                          formatValeur={GROUPES.find((g) => g.metrique === ouvert.metrique)!.formatValeur}
                          nomDe={nomDe}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
