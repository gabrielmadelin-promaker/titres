import { useState } from "react";
import type { Societe } from "../types";
import { PAYS } from "../lib/pays";

interface Props {
  onAdd: (societe: Omit<Societe, "id">) => void;
}

function champVide(): string {
  return "";
}

export function SocieteForm({ onAdd }: Props) {
  const [nom, setNom] = useState("");
  const [valeurNominale, setValeurNominale] = useState(champVide());
  const [pays, setPays] = useState(champVide());
  const [siegeSocial, setSiegeSocial] = useState(champVide());
  const [siren, setSiren] = useState(champVide());
  const [lei, setLei] = useState(champVide());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nomPropre = nom.trim();
    if (!nomPropre) return;

    onAdd({
      nom: nomPropre,
      // Non modifiable depuis l'interface : toujours faux à la création,
      // seule une intervention directe en base peut changer ce champ.
      principale: false,
      valeurNominale: valeurNominale ? Number(valeurNominale) : null,
      pays: pays || null,
      siegeSocial: siegeSocial.trim() || null,
      siren: siren.trim() || null,
      lei: lei.trim() || null,
    });

    setNom("");
    setValeurNominale(champVide());
    setPays(champVide());
    setSiegeSocial(champVide());
    setSiren(champVide());
    setLei(champVide());
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="societe-nom">Nom de la société</label>
        <input
          id="societe-nom"
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Ex : Acme SAS"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="societe-valeur-nominale">Valeur nominale de l'action</label>
        <input
          id="societe-valeur-nominale"
          type="number"
          step="0.0001"
          min="0"
          value={valeurNominale}
          onChange={(e) => setValeurNominale(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="societe-pays">Pays</label>
        <select id="societe-pays" value={pays} onChange={(e) => setPays(e.target.value)}>
          <option value="">Non renseigné</option>
          {PAYS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="societe-siege">Siège social</label>
        <input
          id="societe-siege"
          type="text"
          value={siegeSocial}
          onChange={(e) => setSiegeSocial(e.target.value)}
          placeholder="Adresse du siège"
        />
      </div>

      <div className="form-field">
        <label htmlFor="societe-siren">SIREN</label>
        <input id="societe-siren" type="text" value={siren} onChange={(e) => setSiren(e.target.value)} />
      </div>

      <div className="form-field">
        <label htmlFor="societe-lei">LEI</label>
        <input id="societe-lei" type="text" value={lei} onChange={(e) => setLei(e.target.value)} />
      </div>

      <button type="submit" className="btn btn-primary">
        Ajouter la société
      </button>
    </form>
  );
}
