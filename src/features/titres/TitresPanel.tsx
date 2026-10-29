import { useMemo, useState } from "react";
import type { Compte, Societe, Titre } from "../../types";
import { formatDate, formatDecimal, formatMontant } from "../../utils/format";
import { basculerTri, comparerValeurs, flecheTri, type EtatTri } from "../../utils/tri";
import { exporterXlsx } from "../../utils/xlsxExport";

interface Props {
  societes: Societe[];
  actions: Titre[];
  comptes: Compte[];
}

type Colonne = "emettrice" | "categorie" | "detenteur" | "compte" | "quantite" | "prixInitial" | "prixAcquisition" | "dateAcquisition";

/**
 * Consultation en lecture seule des lots d'Actions (qui détient combien, de
 * quelle catégorie, sur quel compte, à quel prix) — alimentés automatiquement
 * par l'API à chaque création/modification/suppression de transaction,
 * jamais saisis à la main : pas de formulaire d'ajout ici, uniquement une
 * consultation filtrable et exportable.
 */
export function TitresPanel({ societes, actions, comptes }: Props) {
  const [filtreEmettriceId, setFiltreEmettriceId] = useState("");
  const [filtreDetenteurId, setFiltreDetenteurId] = useState("");
  const [tri, setTri] = useState<EtatTri<Colonne>>({ colonne: "emettrice", sens: "asc" });

  const nomParId = useMemo(() => new Map(societes.map((s) => [s.id, s.nom])), [societes]);
  const nomDe = (id: string | null) => (id ? (nomParId.get(id) ?? "(supprimée)") : null);
  const societesTriees = [...societes].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const nomCompteParId = useMemo(() => new Map(comptes.map((c) => [c.id, c.nom])), [comptes]);
  const nomCompteDe = (id: string | null) => (id ? (nomCompteParId.get(id) ?? "(supprimé)") : "—");

  function detenteurTexte(t: Titre): string {
    return t.societeDetentriceId ? (nomDe(t.societeDetentriceId) ?? "(supprimée)") : (t.detenteurNomExterne ?? "—");
  }

  const filtres = useMemo(
    () =>
      actions.filter(
        (t) =>
          (!filtreEmettriceId || t.societeEmettriceId === filtreEmettriceId) &&
          (!filtreDetenteurId || t.societeDetentriceId === filtreDetenteurId),
      ),
    [actions, filtreEmettriceId, filtreDetenteurId],
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
        case "compte":
          return nomCompteDe(t.compteId);
        case "quantite":
          return t.quantite;
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
  }, [filtres, tri, nomParId, nomCompteParId]);

  function exporter() {
    return exporterXlsx(
      "titres-actions.xlsx",
      "Actions",
      triees.map((t) => ({
        "Société émettrice": nomDe(t.societeEmettriceId) ?? "(supprimée)",
        Catégorie: t.categorie ?? "",
        Détenteur: detenteurTexte(t),
        Compte: nomCompteDe(t.compteId),
        Quantité: t.quantite,
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
          <button type="button" className="btn btn-secondary btn-small" onClick={exporter}>
            Exporter en xlsx
          </button>
        </div>
      </div>

      {actions.length === 0 ? (
        <p className="empty">Aucun titre « actions » pour le moment.</p>
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
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "compte"))}>
                  Compte{flecheTri(tri, "compte")}
                </th>
                <th className="th-tri num" onClick={() => setTri(basculerTri(tri, "quantite"))}>
                  Quantité{flecheTri(tri, "quantite")}
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
                  <td>{nomCompteDe(t.compteId)}</td>
                  <td className="num">{formatDecimal(t.quantite)}</td>
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
