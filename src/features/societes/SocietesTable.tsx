import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "../../api/client";
import type { CoursCloture, HistoriqueTotalSociete, Societe, Transaction, TypeTitre } from "../../types";
import { formatDecimal, formatNombreActions, formatPourcentage } from "../../utils/format";
import { valeurGlobale } from "../../utils/participations";
import { PAYS } from "../../utils/pays";
import { basculerTri, comparerValeurs, flecheTri, type EtatTri } from "../../utils/tri";
import { exporterXlsx } from "../../utils/xlsxExport";
import { HistoriqueTotauxPanel } from "../totaux/HistoriqueTotauxPanel";

interface Props {
  societes: Societe[];
  historiqueTotaux: HistoriqueTotalSociete[];
  transactions: Transaction[];
  types: TypeTitre[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, champs: Omit<Societe, "id">) => void;
  onAddHistoriqueTotal: (ligne: Omit<HistoriqueTotalSociete, "id">) => Promise<boolean>;
  onUpdateHistoriqueTotal: (id: string, ligne: Omit<HistoriqueTotalSociete, "id">) => void;
  onDeleteHistoriqueTotal: (id: string) => void;
}

/** Une ligne affichée dans le tableau : la Société, et toutes les valeurs dérivées (totaux, %, cours). */
interface LigneAffichee {
  societe: Societe;
  totalActions: number | null;
  cloturePrecedente: number | null;
  coursErreur: string | null;
  valorisation: number | null;
  dvTheoriqueTotal: number | null;
  dvExercableTotal: number | null;
  capital: number | null;
  dvTheorique: number | null;
  dvExercable: number | null;
}

// Les colonnes facultatives (masquables individuellement, voir COLONNES
// ci-dessous) — "nom" (toujours affichée en premier) et les boutons
// d'action (toujours en dernier) ne sont pas de celles-ci.
type ColonneId =
  | "isin"
  | "codeMnemonique"
  | "pays"
  | "siegeSocial"
  | "siren"
  | "lei"
  | "totalActions"
  | "cloturePrecedente"
  | "valorisation"
  | "dvTheoriqueTotal"
  | "dvExercableTotal"
  | "capital"
  | "dvTheorique"
  | "dvExercable";

type Colonne = "nom" | ColonneId;

interface ColonneDef {
  id: ColonneId;
  label: string;
  num?: boolean;
  /** Valeur brute : sert à la fois au tri et à l'export xlsx (nombre non formaté, ou chaîne/"" pour une colonne texte). */
  valeur: (l: LigneAffichee) => string | number | null;
  afficher: (l: LigneAffichee) => ReactNode;
  classeCellule?: (l: LigneAffichee) => string;
}

// Colonnes configurables : chacune peut être masquée/affichée via la case
// "Colonnes affichées" (voir colonnesVisibles ci-dessous), choix mémorisé
// dans le navigateur (localStorage) d'un affichage à l'autre.
const COLONNES: ColonneDef[] = [
  { id: "isin", label: "Code ISIN", valeur: (l) => l.societe.isin ?? "", afficher: (l) => l.societe.isin ?? "—" },
  {
    id: "codeMnemonique",
    label: "Code mnémonique",
    valeur: (l) => l.societe.codeMnemonique ?? "",
    afficher: (l) => l.societe.codeMnemonique ?? "—",
  },
  { id: "pays", label: "Pays", valeur: (l) => l.societe.pays ?? "", afficher: (l) => l.societe.pays ?? "—" },
  {
    id: "siegeSocial",
    label: "Siège social",
    valeur: (l) => l.societe.siegeSocial ?? "",
    afficher: (l) => l.societe.siegeSocial ?? "—",
  },
  { id: "siren", label: "SIREN", valeur: (l) => l.societe.siren ?? "", afficher: (l) => l.societe.siren ?? "—" },
  { id: "lei", label: "LEI", valeur: (l) => l.societe.lei ?? "", afficher: (l) => l.societe.lei ?? "—" },
  {
    id: "totalActions",
    label: "Total actions",
    num: true,
    valeur: (l) => l.totalActions,
    afficher: (l) => (l.totalActions === null ? "—" : formatNombreActions(l.totalActions)),
  },
  {
    id: "cloturePrecedente",
    label: "Clôture veille",
    num: true,
    valeur: (l) => l.cloturePrecedente,
    afficher: (l) =>
      l.cloturePrecedente === null ? (
        <span title={l.coursErreur ?? "Code mnémonique non renseigné."}>—</span>
      ) : (
        formatDecimal(l.cloturePrecedente)
      ),
  },
  {
    id: "valorisation",
    label: "Valorisation (actions × clôture veille)",
    num: true,
    valeur: (l) => l.valorisation,
    afficher: (l) => (l.valorisation === null ? "—" : formatDecimal(l.valorisation)),
  },
  {
    id: "dvTheoriqueTotal",
    label: "Total DV théorique",
    num: true,
    valeur: (l) => l.dvTheoriqueTotal,
    afficher: (l) => (l.dvTheoriqueTotal === null ? "—" : formatDecimal(l.dvTheoriqueTotal)),
  },
  {
    id: "dvExercableTotal",
    label: "Total DV exerçable",
    num: true,
    valeur: (l) => l.dvExercableTotal,
    afficher: (l) => (l.dvExercableTotal === null ? "—" : formatDecimal(l.dvExercableTotal)),
  },
  {
    id: "capital",
    label: "Capital %",
    num: true,
    valeur: (l) => l.capital,
    afficher: (l) => (l.capital === null ? "—" : formatPourcentage(l.capital)),
    classeCellule: (l) => (l.capital !== null && l.capital > 100 ? "warning" : ""),
  },
  {
    id: "dvTheorique",
    label: "DV théorique %",
    num: true,
    valeur: (l) => l.dvTheorique,
    afficher: (l) => (l.dvTheorique === null ? "—" : formatPourcentage(l.dvTheorique)),
  },
  {
    id: "dvExercable",
    label: "DV exerçable %",
    num: true,
    valeur: (l) => l.dvExercable,
    afficher: (l) => (l.dvExercable === null ? "—" : formatPourcentage(l.dvExercable)),
  },
];

const CLE_COLONNES_VISIBLES = "titres_societes_colonnes_visibles";

function lireColonnesVisibles(): Set<ColonneId> {
  try {
    const brut = localStorage.getItem(CLE_COLONNES_VISIBLES);
    if (brut) return new Set(JSON.parse(brut) as ColonneId[]);
  } catch {
    // Stockage indisponible (navigation privée...) : repli sur "tout affiché".
  }
  return new Set(COLONNES.map((c) => c.id));
}

function ecrireColonnesVisibles(colonnes: Set<ColonneId>) {
  try {
    localStorage.setItem(CLE_COLONNES_VISIBLES, JSON.stringify([...colonnes]));
  } catch {
    // Sans conséquence : le choix ne survivra pas à un rechargement.
  }
}

interface SocieteEditRowProps {
  societe: Societe;
  onSave: (champs: Omit<Societe, "id">) => void;
  onCancel: () => void;
}

function SocieteEditRow({ societe, onSave, onCancel }: SocieteEditRowProps) {
  const [nom, setNom] = useState(societe.nom);
  const [isin, setIsin] = useState(societe.isin ?? "");
  const [codeMnemonique, setCodeMnemonique] = useState(societe.codeMnemonique ?? "");
  const [pays, setPays] = useState(societe.pays ?? "");
  const [siegeSocial, setSiegeSocial] = useState(societe.siegeSocial ?? "");
  const [siren, setSiren] = useState(societe.siren ?? "");
  const [lei, setLei] = useState(societe.lei ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nomPropre = nom.trim();
    if (!nomPropre) return;
    onSave({
      nom: nomPropre,
      isin: isin.trim() || null,
      codeMnemonique: codeMnemonique.trim() || null,
      pays: pays || null,
      siegeSocial: siegeSocial.trim() || null,
      siren: siren.trim() || null,
      lei: lei.trim() || null,
    });
  }

  return (
    <form className="form edit-row-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label>Nom</label>
        <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} required />
      </div>
      <div className="form-field">
        <label>Code ISIN</label>
        <input type="text" value={isin} onChange={(e) => setIsin(e.target.value)} />
      </div>
      <div className="form-field">
        <label>Code mnémonique</label>
        <input
          type="text"
          value={codeMnemonique}
          onChange={(e) => setCodeMnemonique(e.target.value)}
          placeholder="Ex : MC.PA (Yahoo Finance)"
          title="Pour la colonne Clôture veille (Yahoo Finance) : symbole + suffixe de marché, ex. MC.PA, ASML.AS (pas de suffixe pour les valeurs US, ex. AAPL)."
        />
      </div>
      <div className="form-field">
        <label>Pays</label>
        <select value={pays} onChange={(e) => setPays(e.target.value)}>
          <option value="">Non renseigné</option>
          {PAYS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label>Siège social</label>
        <input type="text" value={siegeSocial} onChange={(e) => setSiegeSocial(e.target.value)} />
      </div>
      <div className="form-field">
        <label>SIREN</label>
        <input type="text" value={siren} onChange={(e) => setSiren(e.target.value)} />
      </div>
      <div className="form-field">
        <label>LEI</label>
        <input type="text" value={lei} onChange={(e) => setLei(e.target.value)} />
      </div>
      <div className="edit-row-actions">
        <button type="button" className="btn btn-secondary btn-small" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="btn btn-primary btn-small">
          Enregistrer
        </button>
      </div>
    </form>
  );
}

/** Liste des sociétés, avec édition en ligne et accès aux totaux (HistoriqueTotauxPanel) de chacune. */
export function SocietesTable({
  societes,
  historiqueTotaux,
  transactions,
  types,
  onDelete,
  onUpdate,
  onAddHistoriqueTotal,
  onUpdateHistoriqueTotal,
  onDeleteHistoriqueTotal,
}: Props) {
  const [tri, setTri] = useState<EtatTri<Colonne>>({ colonne: "nom", sens: "asc" });
  const [ligneEditee, setLigneEditee] = useState<string | null>(null);
  const [totauxOuverts, setTotauxOuverts] = useState<string | null>(null);
  const [colonnesVisibles, setColonnesVisibles] = useState<Set<ColonneId>>(lireColonnesVisibles);
  const [coursParCode, setCoursParCode] = useState<Map<string, CoursCloture>>(new Map());

  function basculerColonne(id: ColonneId) {
    setColonnesVisibles((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      ecrireColonnesVisibles(suivant);
      return suivant;
    });
  }

  // Un seul appel groupé (Yahoo Finance, via le serveur) pour tous les codes
  // mnémoniques renseignés — pas un par Société, quel que soit le nombre de
  // lignes du tableau.
  const codesMnemoniques = useMemo(
    () => [...new Set(societes.map((s) => s.codeMnemonique?.trim()).filter((c): c is string => !!c))].sort(),
    [societes],
  );
  const cleCodes = codesMnemoniques.join(",");

  useEffect(() => {
    if (codesMnemoniques.length === 0) {
      setCoursParCode(new Map());
      return;
    }
    let annule = false;
    api
      .fetchCoursCloture(codesMnemoniques)
      .then((cours) => {
        if (!annule) setCoursParCode(new Map(cours.map((c) => [c.codeMnemonique, c])));
      })
      .catch(() => {
        // Sans conséquence pour le reste du tableau : les cellules Clôture
        // veille/Valorisation restent simplement à "—" pour cette session.
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleCodes]);

  const lignes = useMemo<LigneAffichee[]>(
    () =>
      societes.map((s) => {
        const totalActions = valeurGlobale(s.id, transactions, "nombreActions", historiqueTotaux, types);
        const cours = s.codeMnemonique ? coursParCode.get(s.codeMnemonique.trim()) : undefined;
        const cloturePrecedente = cours?.clotureVeille ?? null;
        return {
          societe: s,
          totalActions,
          cloturePrecedente,
          coursErreur: cours?.erreur ?? null,
          valorisation: totalActions !== null && cloturePrecedente !== null ? totalActions * cloturePrecedente : null,
          dvTheoriqueTotal: valeurGlobale(s.id, transactions, "nombreDroitVoteTheorique", historiqueTotaux, types),
          dvExercableTotal: valeurGlobale(s.id, transactions, "nombreDroitVoteExercable", historiqueTotaux, types),
          capital: valeurGlobale(s.id, transactions, "capital", historiqueTotaux, types),
          dvTheorique: valeurGlobale(s.id, transactions, "droitVoteTheorique", historiqueTotaux, types),
          dvExercable: valeurGlobale(s.id, transactions, "droitVoteExercable", historiqueTotaux, types),
        };
      }),
    [societes, transactions, historiqueTotaux, types, coursParCode],
  );

  const colonnesAffichees = COLONNES.filter((c) => colonnesVisibles.has(c.id));

  const triees = useMemo(() => {
    const facteur = tri.sens === "asc" ? 1 : -1;
    const cle = (l: LigneAffichee): string | number => {
      if (tri.colonne === "nom") return l.societe.nom;
      const colonne = COLONNES.find((c) => c.id === tri.colonne);
      if (!colonne) return "";
      const v = colonne.valeur(l);
      return v ?? (colonne.num ? -Infinity : "");
    };
    return [...lignes].sort((a, b) => facteur * comparerValeurs(cle(a), cle(b)));
  }, [lignes, tri]);

  function exporter() {
    return exporterXlsx(
      "societes.xlsx",
      "Sociétés",
      triees.map((l) => {
        const ligne: Record<string, string | number> = { Société: l.societe.nom };
        for (const c of colonnesAffichees) ligne[c.label] = c.valeur(l) ?? "";
        return ligne;
      }),
    );
  }

  if (societes.length === 0) {
    return <p className="empty">Aucune société pour le moment.</p>;
  }

  const colSpanLignesEtendues = 2 + colonnesAffichees.length;

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

      <div className="table-colonnes">
        <span className="table-colonnes-titre">Colonnes affichées</span>
        {COLONNES.map((c) => (
          <div className="form-field-checkbox" key={c.id}>
            <label>
              <input type="checkbox" checked={colonnesVisibles.has(c.id)} onChange={() => basculerColonne(c.id)} />
              {c.label}
            </label>
          </div>
        ))}
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th className="th-tri" onClick={() => setTri(basculerTri(tri, "nom"))}>
                Société{flecheTri(tri, "nom")}
              </th>
              {colonnesAffichees.map((c) => (
                <th
                  key={c.id}
                  className={`th-tri ${c.num ? "num" : ""}`}
                  onClick={() => setTri(basculerTri(tri, c.id))}
                >
                  {c.label}
                  {flecheTri(tri, c.id)}
                </th>
              ))}
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {triees.map((l) => (
              <Fragment key={l.societe.id}>
                <tr>
                  <td>{l.societe.nom}</td>
                  {colonnesAffichees.map((c) => (
                    <td key={c.id} className={`${c.num ? "num" : ""} ${c.classeCellule?.(l) ?? ""}`}>
                      {c.afficher(l)}
                    </td>
                  ))}
                  <td className="actions">
                    <div className="actions-groupe">
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => setTotauxOuverts(totauxOuverts === l.societe.id ? null : l.societe.id)}
                      >
                        Totaux
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => setLigneEditee(ligneEditee === l.societe.id ? null : l.societe.id)}
                      >
                        Modifier
                      </button>
                      <button type="button" className="btn btn-danger btn-small" onClick={() => onDelete(l.societe.id)}>
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
                {ligneEditee === l.societe.id && (
                  <tr>
                    <td colSpan={colSpanLignesEtendues}>
                      <SocieteEditRow
                        societe={l.societe}
                        onCancel={() => setLigneEditee(null)}
                        onSave={(champs) => {
                          onUpdate(l.societe.id, champs);
                          setLigneEditee(null);
                        }}
                      />
                    </td>
                  </tr>
                )}
                {totauxOuverts === l.societe.id && (
                  <tr>
                    <td colSpan={colSpanLignesEtendues}>
                      <HistoriqueTotauxPanel
                        societes={societes}
                        historique={historiqueTotaux}
                        types={types}
                        societeIdVerrouille={l.societe.id}
                        onAdd={onAddHistoriqueTotal}
                        onUpdate={onUpdateHistoriqueTotal}
                        onDelete={onDeleteHistoriqueTotal}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
