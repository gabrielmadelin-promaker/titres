import { Fragment, useMemo, useState } from "react";
import type { Compte, Societe, TypeTitre } from "../types";
import { basculerTri, comparerValeurs, flecheTri, type EtatTri } from "../lib/tri";
import { Modal } from "./Modal";

interface Props {
  societes: Societe[];
  comptes: Compte[];
  types: TypeTitre[];
  onAdd: (compte: Omit<Compte, "id">) => Promise<Compte | null>;
  onUpdate: (id: string, compte: Omit<Compte, "id">) => void;
  onDelete: (id: string) => void;
}

type Colonne = "detenteur" | "societe" | "type" | "nom";

interface ChampsCompteProps {
  detenteurExterne: boolean;
  setDetenteurExterne: (v: boolean) => void;
  detenteurId: string;
  setDetenteurId: (v: string) => void;
  detenteurNomExterne: string;
  setDetenteurNomExterne: (v: string) => void;
  societeEmettriceId: string;
  setSocieteEmettriceId: (v: string) => void;
  type: string;
  setType: (v: string) => void;
  nom: string;
  setNom: (v: string) => void;
  societesTriees: Societe[];
  types: TypeTitre[];
  idPrefix: string;
}

function ChampsCompte({
  detenteurExterne,
  setDetenteurExterne,
  detenteurId,
  setDetenteurId,
  detenteurNomExterne,
  setDetenteurNomExterne,
  societeEmettriceId,
  setSocieteEmettriceId,
  type,
  setType,
  nom,
  setNom,
  societesTriees,
  types,
  idPrefix,
}: ChampsCompteProps) {
  return (
    <>
      <div className="form-field">
        <div className="form-field-entete">
          <label htmlFor={`${idPrefix}-detenteur`}>Détenteur</label>
          <label className="form-field-toggle">
            <input type="checkbox" checked={detenteurExterne} onChange={(e) => setDetenteurExterne(e.target.checked)} />
            Hors groupe
          </label>
        </div>
        {detenteurExterne ? (
          <input
            id={`${idPrefix}-detenteur`}
            type="text"
            placeholder="Nom du détenteur (hors groupe)"
            value={detenteurNomExterne}
            onChange={(e) => setDetenteurNomExterne(e.target.value)}
            required
          />
        ) : (
          <select id={`${idPrefix}-detenteur`} value={detenteurId} onChange={(e) => setDetenteurId(e.target.value)} required>
            <option value="" disabled>
              Choisir...
            </option>
            {societesTriees.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="form-field">
        <label htmlFor={`${idPrefix}-societe`}>Société émettrice</label>
        <select
          id={`${idPrefix}-societe`}
          value={societeEmettriceId}
          onChange={(e) => setSocieteEmettriceId(e.target.value)}
        >
          <option value="">Non renseignée</option>
          {societesTriees.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor={`${idPrefix}-type`}>Catégorie</label>
        <input
          id={`${idPrefix}-type`}
          type="text"
          maxLength={50}
          list={`${idPrefix}-types-suggestions`}
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="Ex : Action ordinaire"
        />
        <datalist id={`${idPrefix}-types-suggestions`}>
          {types.map((t) => (
            <option key={t.id} value={t.nom} />
          ))}
        </datalist>
      </div>
      <div className="form-field">
        <label htmlFor={`${idPrefix}-nom`}>Nom du compte</label>
        <input id={`${idPrefix}-nom`} type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex : Compte A1" required />
      </div>
    </>
  );
}

interface FormAjoutProps {
  societesTriees: Societe[];
  types: TypeTitre[];
  onAdd: (compte: Omit<Compte, "id">) => Promise<Compte | null>;
  onSuccess: () => void;
}

function FormAjout({ societesTriees, types, onAdd, onSuccess }: FormAjoutProps) {
  const [detenteurExterne, setDetenteurExterne] = useState(false);
  const [detenteurId, setDetenteurId] = useState("");
  const [detenteurNomExterne, setDetenteurNomExterne] = useState("");
  const [societeEmettriceId, setSocieteEmettriceId] = useState("");
  const [type, setType] = useState("");
  const [nom, setNom] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (detenteurExterne ? !detenteurNomExterne.trim() : !detenteurId) return;
    if (!nom.trim()) return;
    const cree = await onAdd({
      detenteurId: detenteurExterne ? null : detenteurId,
      detenteurNomExterne: detenteurExterne ? detenteurNomExterne.trim() : null,
      societeEmettriceId: societeEmettriceId || null,
      type: type.trim() || null,
      nom: nom.trim(),
    });
    if (!cree) return;
    setDetenteurExterne(false);
    setDetenteurId("");
    setDetenteurNomExterne("");
    setSocieteEmettriceId("");
    setType("");
    setNom("");
    onSuccess();
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <ChampsCompte
        detenteurExterne={detenteurExterne}
        setDetenteurExterne={setDetenteurExterne}
        detenteurId={detenteurId}
        setDetenteurId={setDetenteurId}
        detenteurNomExterne={detenteurNomExterne}
        setDetenteurNomExterne={setDetenteurNomExterne}
        societeEmettriceId={societeEmettriceId}
        setSocieteEmettriceId={setSocieteEmettriceId}
        type={type}
        setType={setType}
        nom={nom}
        setNom={setNom}
        societesTriees={societesTriees}
        types={types}
        idPrefix="compte-ajout"
      />
      <button type="submit" className="btn btn-primary">
        Ajouter
      </button>
    </form>
  );
}

interface LigneEditionProps {
  compte: Compte;
  societesTriees: Societe[];
  types: TypeTitre[];
  onSave: (champs: Omit<Compte, "id">) => void;
  onCancel: () => void;
}

function LigneEdition({ compte, societesTriees, types, onSave, onCancel }: LigneEditionProps) {
  const [detenteurExterne, setDetenteurExterne] = useState(compte.detenteurId === null);
  const [detenteurId, setDetenteurId] = useState(compte.detenteurId ?? "");
  const [detenteurNomExterne, setDetenteurNomExterne] = useState(compte.detenteurNomExterne ?? "");
  const [societeEmettriceId, setSocieteEmettriceId] = useState(compte.societeEmettriceId ?? "");
  const [type, setType] = useState(compte.type ?? "");
  const [nom, setNom] = useState(compte.nom);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (detenteurExterne ? !detenteurNomExterne.trim() : !detenteurId) return;
    if (!nom.trim()) return;
    onSave({
      detenteurId: detenteurExterne ? null : detenteurId,
      detenteurNomExterne: detenteurExterne ? detenteurNomExterne.trim() : null,
      societeEmettriceId: societeEmettriceId || null,
      type: type.trim() || null,
      nom: nom.trim(),
    });
  }

  return (
    <form className="form edit-row-form" onSubmit={handleSubmit}>
      <ChampsCompte
        detenteurExterne={detenteurExterne}
        setDetenteurExterne={setDetenteurExterne}
        detenteurId={detenteurId}
        setDetenteurId={setDetenteurId}
        detenteurNomExterne={detenteurNomExterne}
        setDetenteurNomExterne={setDetenteurNomExterne}
        societeEmettriceId={societeEmettriceId}
        setSocieteEmettriceId={setSocieteEmettriceId}
        type={type}
        setType={setType}
        nom={nom}
        setNom={setNom}
        societesTriees={societesTriees}
        types={types}
        idPrefix={`compte-edit-${compte.id}`}
      />
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

export function ComptesPanel({ societes, comptes, types, onAdd, onUpdate, onDelete }: Props) {
  const [tri, setTri] = useState<EtatTri<Colonne>>({ colonne: "detenteur", sens: "asc" });
  const [ligneEditee, setLigneEditee] = useState<string | null>(null);
  const [modaleOuverte, setModaleOuverte] = useState(false);

  const societesTriees = useMemo(() => [...societes].sort((a, b) => a.nom.localeCompare(b.nom, "fr")), [societes]);
  const nomParId = useMemo(() => new Map(societes.map((s) => [s.id, s.nom])), [societes]);
  const nomDetenteur = (c: Compte) => (c.detenteurId ? (nomParId.get(c.detenteurId) ?? "(supprimée)") : (c.detenteurNomExterne ?? ""));
  const nomSocieteEmettrice = (c: Compte) => (c.societeEmettriceId ? (nomParId.get(c.societeEmettriceId) ?? "(supprimée)") : "—");

  const triees = useMemo(() => {
    const facteur = tri.sens === "asc" ? 1 : -1;
    const cle = (c: Compte): string | number => {
      switch (tri.colonne) {
        case "detenteur":
          return nomDetenteur(c);
        case "societe":
          return nomSocieteEmettrice(c);
        case "type":
          return c.type ?? "";
        case "nom":
          return c.nom;
      }
    };
    return [...comptes].sort((a, b) => facteur * comparerValeurs(cle(a), cle(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comptes, tri, nomParId]);

  if (societes.length === 0 && comptes.length === 0) {
    return <p className="empty">Ajoutez d'abord une société pour pouvoir créer des comptes.</p>;
  }

  return (
    <div>
      <div className="table-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => setModaleOuverte(true)}>
          + Ajouter un compte
        </button>
      </div>
      <Modal title="Ajouter un compte" open={modaleOuverte} onClose={() => setModaleOuverte(false)}>
        <FormAjout societesTriees={societesTriees} types={types} onAdd={onAdd} onSuccess={() => setModaleOuverte(false)} />
      </Modal>

      {triees.length === 0 ? (
        <p className="empty">Aucun compte pour le moment.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "detenteur"))}>
                  Détenteur{flecheTri(tri, "detenteur")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "societe"))}>
                  Société émettrice{flecheTri(tri, "societe")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "type"))}>
                  Catégorie{flecheTri(tri, "type")}
                </th>
                <th className="th-tri" onClick={() => setTri(basculerTri(tri, "nom"))}>
                  Nom du compte{flecheTri(tri, "nom")}
                </th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {triees.map((c) => (
                <Fragment key={c.id}>
                  <tr>
                    <td>
                      {nomDetenteur(c)}
                      {c.detenteurId === null && (
                        <>
                          {" "}
                          <span className="badge">hors groupe</span>
                        </>
                      )}
                    </td>
                    <td>{nomSocieteEmettrice(c)}</td>
                    <td>{c.type ?? "—"}</td>
                    <td>{c.nom}</td>
                    <td className="actions">
                      <div className="actions-groupe">
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => setLigneEditee(ligneEditee === c.id ? null : c.id)}
                        >
                          Modifier
                        </button>
                        <button type="button" className="btn btn-danger btn-small" onClick={() => onDelete(c.id)}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                  {ligneEditee === c.id && (
                    <tr>
                      <td colSpan={5}>
                        <LigneEdition
                          compte={c}
                          societesTriees={societesTriees}
                          types={types}
                          onCancel={() => setLigneEditee(null)}
                          onSave={(champs) => {
                            onUpdate(c.id, champs);
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
