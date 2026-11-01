import { useMemo, useState } from "react";
import type { Societe, Transaction } from "../../types";
import { formatDate, formatDecimal, formatMontant } from "../../utils/format";
import { basculerTri, comparerValeurs, flecheTri, type EtatTri } from "../../utils/tri";
import { exporterXlsx } from "../../utils/xlsxExport";

interface Props {
  societes: Societe[];
  transactions: Transaction[];
}

interface LignePlusValue {
  id: string;
  date: string;
  cibleId: string;
  acheteurId: string | null;
  acheteurNomExterne: string | null;
  vendeurId: string | null;
  vendeurNomExterne: string | null;
  categorie: string | null;
  nombreActions: number;
  prixAction: number | null;
  devise: string;
  plusValue: number;
}

type Colonne = "date" | "cible" | "acheteur" | "vendeur" | "categorie" | "nombreActions" | "prixAction" | "plusValue";

/**
 * Consultation en lecture seule de toutes les lignes de transaction qui ont
 * donné lieu à une plus ou moins-value (calculée à la volée côté backend,
 * voir PlusValueService — jamais stockée) : une ligne de transaction sans
 * titre d'origine identifiable (ex. achat externe pur) n'a pas de
 * plus-value et n'apparaît donc pas ici.
 */
export function PlusValuesPanel({ societes, transactions }: Props) {
  const [filtreCibleId, setFiltreCibleId] = useState("");
  const [tri, setTri] = useState<EtatTri<Colonne>>({ colonne: "date", sens: "desc" });

  const nomParId = useMemo(() => new Map(societes.map((s) => [s.id, s.nom])), [societes]);
  const nomDe = (id: string | null) => (id ? (nomParId.get(id) ?? "(supprimée)") : null);
  const societesTriees = [...societes].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  const acheteurTexte = (l: LignePlusValue) => (l.acheteurId ? (nomDe(l.acheteurId) ?? "(supprimée)") : (l.acheteurNomExterne ?? "—"));
  const vendeurTexte = (l: LignePlusValue) =>
    l.vendeurId ? (nomDe(l.vendeurId) ?? "(supprimée)") : l.vendeurNomExterne ? l.vendeurNomExterne : "—";

  const lignes = useMemo(() => {
    const resultat: LignePlusValue[] = [];
    for (const t of transactions) {
      for (const l of t.lignes) {
        if (l.plusValue === null) continue;
        resultat.push({
          id: l.id,
          date: t.date,
          cibleId: t.cibleId,
          acheteurId: t.acheteurId,
          acheteurNomExterne: t.acheteurNomExterne,
          vendeurId: t.vendeurId,
          vendeurNomExterne: t.vendeurNomExterne,
          categorie: l.categorie,
          nombreActions: l.nombreActions,
          prixAction: t.prixAction,
          devise: t.devise,
          plusValue: l.plusValue,
        });
      }
    }
    return resultat;
  }, [transactions]);

  const filtrees = useMemo(
    () => lignes.filter((l) => !filtreCibleId || l.cibleId === filtreCibleId),
    [lignes, filtreCibleId],
  );

  const triees = useMemo(() => {
    const facteur = tri.sens === "asc" ? 1 : -1;
    const cle = (l: LignePlusValue): string | number => {
      switch (tri.colonne) {
        case "date":
          return l.date;
        case "cible":
          return nomDe(l.cibleId) ?? "(supprimée)";
        case "acheteur":
          return acheteurTexte(l);
        case "vendeur":
          return vendeurTexte(l);
        case "categorie":
          return l.categorie ?? "";
        case "nombreActions":
          return l.nombreActions;
        case "prixAction":
          return l.prixAction ?? -Infinity;
        case "plusValue":
          return l.plusValue;
      }
    };
    return [...filtrees].sort((a, b) => facteur * comparerValeurs(cle(a), cle(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrees, tri, nomParId]);

  // Une somme n'a de sens que si toutes les lignes partagent la même devise
  // (rare mais possible si plusieurs devises sont utilisées) : sinon, pas de
  // total affiché plutôt qu'un chiffre trompeur mélangeant des devises.
  const deviseUnique = useMemo(() => {
    const devises = new Set(triees.map((l) => l.devise));
    return devises.size === 1 ? [...devises][0] : null;
  }, [triees]);
  const totalPlusValue = useMemo(() => triees.reduce((s, l) => s + l.plusValue, 0), [triees]);

  function exporter() {
    return exporterXlsx(
      "plus-values.xlsx",
      "Plus-values",
      triees.map((l) => ({
        Date: l.date,
        "Société cible": nomDe(l.cibleId) ?? "(supprimée)",
        Acheteur: acheteurTexte(l),
        Vendeur: vendeurTexte(l),
        Catégorie: l.categorie ?? "",
        "Nombre d'actions": l.nombreActions,
        "Prix action": l.prixAction ?? "",
        Devise: l.devise,
        "Plus-value": l.plusValue,
      })),
    );
  }

  return (
    <div>
      <div className="table-toolbar">
        <div className="table-filters">
          <div className="form-field">
            <label htmlFor="pv-filtre-cible">Société cible</label>
            <select id="pv-filtre-cible" value={filtreCibleId} onChange={(e) => setFiltreCibleId(e.target.value)}>
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
          <span className="subtitle-panel">
            {deviseUnique
              ? `Total : ${formatMontant(totalPlusValue, deviseUnique)}`
              : triees.length > 0
                ? "Total non affiché (devises mixtes)"
                : ""}
          </span>
          <button type="button" className="btn btn-secondary btn-small" onClick={exporter}>
            Exporter en xlsx
          </button>
        </div>
      </div>

      {lignes.length === 0 ? (
        <p className="empty">Aucune opération n'a encore donné lieu à une plus ou moins-value.</p>
      ) : triees.length === 0 ? (
        <p className="empty">Aucune opération ne correspond à ce filtre.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "date"))}>
                  Date{flecheTri(tri, "date")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "cible"))}>
                  Société cible{flecheTri(tri, "cible")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "acheteur"))}>
                  Acheteur{flecheTri(tri, "acheteur")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "vendeur"))}>
                  Vendeur{flecheTri(tri, "vendeur")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "categorie"))}>
                  Catégorie{flecheTri(tri, "categorie")}
                </th>
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "nombreActions"))}>
                  Nombre d'actions{flecheTri(tri, "nombreActions")}
                </th>
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "prixAction"))}>
                  Prix action{flecheTri(tri, "prixAction")}
                </th>
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "plusValue"))}>
                  Plus-value{flecheTri(tri, "plusValue")}
                </th>
              </tr>
            </thead>
            <tbody>
              {triees.map((l) => (
                <tr key={l.id}>
                  <td>{formatDate(l.date)}</td>
                  <td>{nomDe(l.cibleId) ?? "(supprimée)"}</td>
                  <td>{acheteurTexte(l)}</td>
                  <td>{vendeurTexte(l)}</td>
                  <td>{l.categorie ?? "—"}</td>
                  <td className="num">{formatDecimal(l.nombreActions)}</td>
                  <td className="num">{l.prixAction === null ? "—" : formatMontant(l.prixAction, l.devise)}</td>
                  <td className={`num ${l.plusValue < 0 ? "valeur-negative" : ""}`}>{formatMontant(l.plusValue, l.devise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
