import { Fragment, useMemo, useState } from "react";
import type { Compte, HistoriqueTotalSociete, Societe, Transaction, TypeTitre } from "../types";
import { formatDate, formatDecimal, formatMontant, formatPourcentage } from "../lib/format";
import { extraireValeurTransaction } from "../lib/participations";
import { basculerTri, comparerValeurs, flecheTri, type EtatTri } from "../lib/tri";
import { champsDepuisTransaction, champsVersTransaction, validerChamps } from "../lib/transactionChamps";
import { TransactionChampsFields } from "./TransactionChamps";
import { exporterXlsx } from "../lib/xlsxExport";

interface Props {
  transactions: Transaction[];
  societes: Societe[];
  historiqueTotaux: HistoriqueTotalSociete[];
  types: TypeTitre[];
  comptes: Compte[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, champs: Omit<Transaction, "id">) => void;
}

interface TransactionEditRowProps {
  transaction: Transaction;
  societes: Societe[];
  types: TypeTitre[];
  comptes: Compte[];
  onSave: (champs: Omit<Transaction, "id">) => void;
  onCancel: () => void;
}

function TransactionEditRow({ transaction, societes, types, comptes, onSave, onCancel }: TransactionEditRowProps) {
  const [champs, setChamps] = useState(() => champsDepuisTransaction(transaction));
  const [erreur, setErreur] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const messageErreur = validerChamps(champs);
    if (messageErreur) {
      setErreur(messageErreur);
      return;
    }
    onSave(champsVersTransaction(champs));
  }

  return (
    <form className="form edit-row-form" onSubmit={handleSubmit}>
      <TransactionChampsFields
        champs={champs}
        onChange={setChamps}
        societes={societes}
        types={types}
        comptes={comptes}
        idPrefix={`tx-edit-${transaction.id}`}
      />
      {erreur && <p className="form-error">{erreur}</p>}
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

type Colonne =
  | "date"
  | "acheteur"
  | "cible"
  | "vendeur"
  | "nombreActions"
  | "nombreDvTheorique"
  | "nombreDvExercable"
  | "detail"
  | "capital"
  | "dvTheorique"
  | "dvExercable"
  | "prixAction"
  | "plusValue";

function formatOuTiret(valeur: number | null | undefined, formateur: (v: number) => string): string {
  // == plutôt que === : une transaction venant d'une API pas encore mise à
  // jour (déploiement en deux temps) peut avoir ce champ absent (undefined)
  // plutôt qu'explicitement nul — sans ça, ça affichait "NaN" au lieu de "—".
  return valeur == null ? "—" : formateur(valeur);
}

/** Nombre d'actions total d'une transaction : somme de ses lignes (une transaction peut porter sur plusieurs Catégories). */
function nombreActionsTotal(t: Transaction): number {
  return t.lignes.reduce((s, l) => s + l.nombreActions, 0);
}

/** Plus-value totale d'une transaction : somme des plus-values de ses lignes (null si aucune ligne n'en a). */
function plusValueTotal(t: Transaction): number | null {
  const valeurs = t.lignes.map((l) => l.plusValue).filter((v): v is number => v !== null);
  return valeurs.length > 0 ? valeurs.reduce((s, v) => s + v, 0) : null;
}

export function TransactionsTable({ transactions, societes, historiqueTotaux, types, comptes, onDelete, onUpdate }: Props) {
  const [tri, setTri] = useState<EtatTri<Colonne>>({ colonne: "date", sens: "desc" });
  const [filtreAcheteurId, setFiltreAcheteurId] = useState("");
  const [filtreCibleId, setFiltreCibleId] = useState("");
  const [ligneEditee, setLigneEditee] = useState<string | null>(null);

  const nomParId = useMemo(() => new Map(societes.map((s) => [s.id, s.nom])), [societes]);
  const nomDe = (id: string | null) => (id ? (nomParId.get(id) ?? "(supprimée)") : "—");
  const societesTriees = [...societes].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const nomCompteParId = useMemo(() => new Map(comptes.map((c) => [c.id, c.nom])), [comptes]);
  const nomCompteDe = (id: string | null) => (id ? (nomCompteParId.get(id) ?? "(supprimé)") : null);

  function detailLignes(t: Transaction): string {
    return t.lignes
      .map((l) => {
        const compteAcheteur = nomCompteDe(l.compteAcheteurId);
        const compteVendeur = nomCompteDe(l.compteVendeurId);
        const comptesTexte = [compteAcheteur && `ach. : ${compteAcheteur}`, compteVendeur && `vend. : ${compteVendeur}`]
          .filter(Boolean)
          .join(", ");
        return `${l.categorie ?? "(non précisé)"} : ${formatDecimal(l.nombreActions)}${comptesTexte ? ` (${comptesTexte})` : ""}`;
      })
      .join(" ; ");
  }

  function celluleAcheteur(t: Transaction) {
    if (t.acheteurId) return nomDe(t.acheteurId);
    return (
      <>
        {t.acheteurNomExterne || "(sans nom)"} <span className="badge">hors groupe</span>
      </>
    );
  }

  function celluleVendeur(t: Transaction) {
    if (t.vendeurId) return nomDe(t.vendeurId);
    if (t.vendeurNomExterne) {
      return (
        <>
          {t.vendeurNomExterne} <span className="badge">hors groupe</span>
        </>
      );
    }
    return "—";
  }

  const filtrees = useMemo(
    () =>
      transactions.filter(
        (t) =>
          (!filtreAcheteurId || t.acheteurId === filtreAcheteurId) &&
          (!filtreCibleId || t.cibleId === filtreCibleId),
      ),
    [transactions, filtreAcheteurId, filtreCibleId],
  );

  const triees = useMemo(() => {
    const facteur = tri.sens === "asc" ? 1 : -1;
    const cle = (t: Transaction): string | number => {
      switch (tri.colonne) {
        case "date":
          return t.date;
        case "acheteur":
          return t.acheteurId ? (nomParId.get(t.acheteurId) ?? "(supprimée)") : (t.acheteurNomExterne ?? "");
        case "cible":
          return nomParId.get(t.cibleId) ?? "(supprimée)";
        case "vendeur":
          return t.vendeurId ? (nomParId.get(t.vendeurId) ?? "(supprimée)") : (t.vendeurNomExterne ?? "");
        case "nombreActions":
          return nombreActionsTotal(t);
        case "nombreDvTheorique":
          return t.nombreDroitVoteTheorique ?? -Infinity;
        case "nombreDvExercable":
          return t.nombreDroitVoteExercable ?? -Infinity;
        case "detail":
          return detailLignes(t);
        case "capital":
          return extraireValeurTransaction(t, "capital", historiqueTotaux) ?? -Infinity;
        case "dvTheorique":
          return extraireValeurTransaction(t, "droitVoteTheorique", historiqueTotaux) ?? -Infinity;
        case "dvExercable":
          return extraireValeurTransaction(t, "droitVoteExercable", historiqueTotaux) ?? -Infinity;
        case "prixAction":
          return t.prixAction ?? -Infinity;
        case "plusValue":
          return plusValueTotal(t) ?? -Infinity;
      }
    };
    return [...filtrees].sort((a, b) => facteur * comparerValeurs(cle(a), cle(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrees, tri, nomParId, nomCompteParId, historiqueTotaux]);

  function exporter() {
    return exporterXlsx(
      "transactions.xlsx",
      "Transactions",
      triees.map((t) => ({
        Date: t.date,
        Acheteur: t.acheteurId ? nomDe(t.acheteurId) : `${t.acheteurNomExterne ?? ""} (hors groupe)`,
        Cible: nomDe(t.cibleId),
        Vendeur: t.vendeurId
          ? nomDe(t.vendeurId)
          : t.vendeurNomExterne
            ? `${t.vendeurNomExterne} (hors groupe)`
            : "",
        "Nombre d'actions": nombreActionsTotal(t),
        "Nombre de droits de vote théorique": t.nombreDroitVoteTheorique ?? "",
        "Nombre de droits de vote exerçable": t.nombreDroitVoteExercable ?? "",
        "Détail par Catégorie": detailLignes(t),
        "Capital (%)": extraireValeurTransaction(t, "capital", historiqueTotaux) ?? "",
        "Droit de vote théorique (%)": extraireValeurTransaction(t, "droitVoteTheorique", historiqueTotaux) ?? "",
        "Droit de vote exerçable (%)": extraireValeurTransaction(t, "droitVoteExercable", historiqueTotaux) ?? "",
        "Prix de l'action (€)": t.prixAction ?? "",
        "Plus-value (€)": plusValueTotal(t) ?? "",
      })),
    );
  }

  if (transactions.length === 0) {
    return <p className="empty">Aucune transaction pour le moment.</p>;
  }

  return (
    <div>
      <div className="table-toolbar">
        <div className="table-filters">
          <div className="form-field">
            <label htmlFor="tx-filtre-acheteur">Acheteur</label>
            <select id="tx-filtre-acheteur" value={filtreAcheteurId} onChange={(e) => setFiltreAcheteurId(e.target.value)}>
              <option value="">Tous</option>
              {societesTriees.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="tx-filtre-cible">Cible</label>
            <select id="tx-filtre-cible" value={filtreCibleId} onChange={(e) => setFiltreCibleId(e.target.value)}>
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
        <p className="empty">Aucune transaction ne correspond à ce filtre.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "date"))}>
                  Date{flecheTri(tri, "date")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "acheteur"))}>
                  Acheteur{flecheTri(tri, "acheteur")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "cible"))}>
                  Cible{flecheTri(tri, "cible")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "vendeur"))}>
                  Vendeur{flecheTri(tri, "vendeur")}
                </th>
                <th
                  className="th-tri num"
                  onClick={() => setTri(basculerTri(tri, "nombreActions"))}
                  title="Somme des lignes de cette transaction (une transaction peut porter sur plusieurs Catégories à la fois)."
                >
                  Nombre d'actions{flecheTri(tri, "nombreActions")}
                </th>
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "nombreDvTheorique"))}>
                  Nombre DV théorique{flecheTri(tri, "nombreDvTheorique")}
                </th>
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "nombreDvExercable"))}>
                  Nombre DV exerçable{flecheTri(tri, "nombreDvExercable")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "detail"))}>
                  Détail par Catégorie{flecheTri(tri, "detail")}
                </th>
                <th
                  className="th-tri num"
                  onClick={() => setTri(basculerTri(tri, "capital"))}
                  title="Calculé automatiquement (nombre d'actions ÷ total émis par la société cible, en vigueur à la date de cette transaction). Vide si le nombre d'actions ou ce total n'est pas renseigné."
                >
                  Capital %{flecheTri(tri, "capital")}
                </th>
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "dvTheorique"))}>
                  DV théorique %{flecheTri(tri, "dvTheorique")}
                </th>
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "dvExercable"))}>
                  DV exerçable %{flecheTri(tri, "dvExercable")}
                </th>
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "prixAction"))}>
                  Prix action{flecheTri(tri, "prixAction")}
                </th>
                <th
                  className="th-tri num"
                  onClick={() => setTri(basculerTri(tri, "plusValue"))}
                  title="Calculée automatiquement, en FIFO sur les lots d'Actions consommés par chaque ligne de cette transaction, puis sommée. Vide si aucune ligne n'a consommé de titre (ex. achat externe pur)."
                >
                  Plus-value{flecheTri(tri, "plusValue")}
                </th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {triees.map((t) => (
                <Fragment key={t.id}>
                  <tr>
                    <td>{formatDate(t.date)}</td>
                    <td>{celluleAcheteur(t)}</td>
                    <td>{nomDe(t.cibleId)}</td>
                    <td>{celluleVendeur(t)}</td>
                    <td className="num">{formatDecimal(nombreActionsTotal(t))}</td>
                    <td className="num">{formatOuTiret(t.nombreDroitVoteTheorique, formatDecimal)}</td>
                    <td className="num">{formatOuTiret(t.nombreDroitVoteExercable, formatDecimal)}</td>
                    <td>{detailLignes(t)}</td>
                    <td className="num">
                      {formatOuTiret(extraireValeurTransaction(t, "capital", historiqueTotaux), formatPourcentage)}
                    </td>
                    <td className="num">
                      {formatOuTiret(extraireValeurTransaction(t, "droitVoteTheorique", historiqueTotaux), formatPourcentage)}
                    </td>
                    <td className="num">
                      {formatOuTiret(extraireValeurTransaction(t, "droitVoteExercable", historiqueTotaux), formatPourcentage)}
                    </td>
                    <td className="num">{formatOuTiret(t.prixAction, formatMontant)}</td>
                    <td className="num">{formatOuTiret(plusValueTotal(t), formatMontant)}</td>
                    <td className="actions">
                      <div className="actions-groupe">
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => setLigneEditee(ligneEditee === t.id ? null : t.id)}
                        >
                          Modifier
                        </button>
                        <button type="button" className="btn btn-danger btn-small" onClick={() => onDelete(t.id)}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                  {ligneEditee === t.id && (
                    <tr>
                      <td colSpan={14}>
                        <TransactionEditRow
                          transaction={t}
                          societes={societes}
                          types={types}
                          comptes={comptes}
                          onCancel={() => setLigneEditee(null)}
                          onSave={(champs) => {
                            onUpdate(t.id, champs);
                            setLigneEditee(null);
                          }}
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
