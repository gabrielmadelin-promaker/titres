import { useMemo, useState } from "react";
import type { Societe, Titre } from "../types";
import type { ResultatInitialisationTitres } from "../lib/api";
import { formatDate, formatMontant } from "../lib/format";
import { basculerTri, comparerValeurs, flecheTri, type EtatTri } from "../lib/tri";
import { exporterXlsx } from "../lib/xlsxExport";

interface Props {
  societes: Societe[];
  actions: Titre[];
  droitsVoteTheorique: Titre[];
  droitsVoteExercable: Titre[];
  /** Régénère les 3 tables de titres à partir des transactions ; renvoie null en cas d'échec (déjà signalé ailleurs). */
  onInitialiser: () => Promise<ResultatInitialisationTitres | null>;
}

type Notion = "actions" | "dvTheorique" | "dvExercable";

const NOTIONS: { id: Notion; libelle: string }[] = [
  { id: "actions", libelle: "Actions" },
  { id: "dvTheorique", libelle: "Droits de vote théorique" },
  { id: "dvExercable", libelle: "Droits de vote exerçable" },
];

type Colonne = "emettrice" | "categorie" | "detenteur" | "prixInitial" | "prixAcquisition" | "dateAcquisition";

/**
 * Consultation en lecture seule du cycle de vie unitaire des titres (qui
 * détient précisément quel titre, à quel prix il a été acquis) — ces trois
 * tables sont alimentées automatiquement par l'API à chaque
 * création/modification/suppression de transaction, jamais saisies à la
 * main : pas de formulaire d'ajout ici, uniquement une consultation
 * filtrable et exportable.
 */
export function TitresPanel({ societes, actions, droitsVoteTheorique, droitsVoteExercable, onInitialiser }: Props) {
  const [notion, setNotion] = useState<Notion>("actions");
  const [filtreEmettriceId, setFiltreEmettriceId] = useState("");
  const [filtreDetenteurId, setFiltreDetenteurId] = useState("");
  const [tri, setTri] = useState<EtatTri<Colonne>>({ colonne: "emettrice", sens: "asc" });
  const [initialisationEnCours, setInitialisationEnCours] = useState(false);
  const [messageInitialisation, setMessageInitialisation] = useState<string | null>(null);

  async function handleInitialiser() {
    if (
      !window.confirm(
        "Régénérer entièrement les 3 tables de titres à partir de l'historique des transactions ? " +
          "Les lignes existantes seront remplacées par le résultat du recalcul (sans effet sur les transactions elles-mêmes).",
      )
    ) {
      return;
    }
    setInitialisationEnCours(true);
    setMessageInitialisation(null);
    const resultat = await onInitialiser();
    setInitialisationEnCours(false);
    if (resultat) {
      setMessageInitialisation(
        `${resultat.transactionsTraitees} transaction(s) traitée(s) : ${resultat.actions} action(s), ` +
          `${resultat.droitsVoteTheorique} droit(s) de vote théorique, ${resultat.droitsVoteExercable} droit(s) de vote exerçable.`,
      );
    }
  }

  const nomParId = useMemo(() => new Map(societes.map((s) => [s.id, s.nom])), [societes]);
  const nomDe = (id: string | null) => (id ? (nomParId.get(id) ?? "(supprimée)") : null);
  const societesTriees = [...societes].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  const titresParNotion: Record<Notion, Titre[]> = {
    actions,
    dvTheorique: droitsVoteTheorique,
    dvExercable: droitsVoteExercable,
  };
  const titres = titresParNotion[notion];
  const libelleNotion = NOTIONS.find((n) => n.id === notion)!.libelle;

  function detenteurTexte(t: Titre): string {
    return t.societeDetentriceId ? (nomDe(t.societeDetentriceId) ?? "(supprimée)") : (t.detenteurNomExterne ?? "—");
  }

  const filtres = useMemo(
    () =>
      titres.filter(
        (t) =>
          (!filtreEmettriceId || t.societeEmettriceId === filtreEmettriceId) &&
          (!filtreDetenteurId || t.societeDetentriceId === filtreDetenteurId),
      ),
    [titres, filtreEmettriceId, filtreDetenteurId],
  );

  const triees = useMemo(() => {
    const facteur = tri.sens === "asc" ? 1 : -1;
    const cle = (t: Titre): string | number => {
      switch (tri.colonne) {
        case "emettrice":
          return nomDe(t.societeEmettriceId) ?? "(supprimée)";
        case "categorie":
          return t.categorie ?? "";
        case "detenteur":
          return detenteurTexte(t);
        case "prixInitial":
          return t.prixInitial ?? -Infinity;
        case "prixAcquisition":
          return t.prixAcquisition ?? -Infinity;
        case "dateAcquisition":
          return t.dateAcquisition ?? "";
      }
    };
    return [...filtres].sort((a, b) => facteur * comparerValeurs(cle(a), cle(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtres, tri, nomParId]);

  function exporter() {
    return exporterXlsx(
      `titres-${notion}.xlsx`,
      libelleNotion,
      triees.map((t) => ({
        "Société émettrice": nomDe(t.societeEmettriceId) ?? "(supprimée)",
        Catégorie: t.categorie ?? "",
        Détenteur: detenteurTexte(t),
        "Prix initial (€)": t.prixInitial ?? "",
        "Prix d'acquisition (€)": t.prixAcquisition ?? "",
        "Date d'acquisition": t.dateAcquisition ?? "",
      })),
    );
  }

  return (
    <div>
      <div className="table-toolbar">
        <div className="table-filters">
          <div className="form-field">
            <label htmlFor="titres-notion">Notion</label>
            <select id="titres-notion" value={notion} onChange={(e) => setNotion(e.target.value as Notion)}>
              {NOTIONS.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.libelle}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="titres-filtre-emettrice">Société émettrice</label>
            <select
              id="titres-filtre-emettrice"
              value={filtreEmettriceId}
              onChange={(e) => setFiltreEmettriceId(e.target.value)}
            >
              <option value="">Toutes</option>
              {societesTriees.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="titres-filtre-detenteur">Détenteur</label>
            <select
              id="titres-filtre-detenteur"
              value={filtreDetenteurId}
              onChange={(e) => setFiltreDetenteurId(e.target.value)}
            >
              <option value="">Tous</option>
              {societesTriees.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="viz-actions">
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={handleInitialiser}
            disabled={initialisationEnCours}
          >
            {initialisationEnCours ? "Initialisation en cours…" : "Initialiser depuis les transactions"}
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={exporter}>
            Exporter en xlsx
          </button>
        </div>
      </div>

      {messageInitialisation && <p className="import-result">{messageInitialisation}</p>}

      {titres.length === 0 ? (
        <p className="empty">Aucun titre « {libelleNotion.toLowerCase()} » pour le moment.</p>
      ) : triees.length === 0 ? (
        <p className="empty">Aucun titre ne correspond à ce filtre.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "emettrice"))}>
                  Société émettrice{flecheTri(tri, "emettrice")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "categorie"))}>
                  Catégorie{flecheTri(tri, "categorie")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "detenteur"))}>
                  Détenteur{flecheTri(tri, "detenteur")}
                </th>
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "prixInitial"))}>
                  Prix initial{flecheTri(tri, "prixInitial")}
                </th>
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "prixAcquisition"))}>
                  Prix d'acquisition{flecheTri(tri, "prixAcquisition")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "dateAcquisition"))}>
                  Date d'acquisition{flecheTri(tri, "dateAcquisition")}
                </th>
              </tr>
            </thead>
            <tbody>
              {triees.map((t) => (
                <tr key={t.id}>
                  <td>{nomDe(t.societeEmettriceId) ?? "(supprimée)"}</td>
                  <td>{t.categorie ?? "—"}</td>
                  <td>
                    {t.societeDetentriceId ? (
                      (nomDe(t.societeDetentriceId) ?? "(supprimée)")
                    ) : (
                      <>
                        {t.detenteurNomExterne ?? "(sans nom)"} <span className="badge">hors groupe</span>
                      </>
                    )}
                  </td>
                  <td className="num">{t.prixInitial === null ? "—" : formatMontant(t.prixInitial)}</td>
                  <td className="num">{t.prixAcquisition === null ? "—" : formatMontant(t.prixAcquisition)}</td>
                  <td>{t.dateAcquisition ? formatDate(t.dateAcquisition) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
