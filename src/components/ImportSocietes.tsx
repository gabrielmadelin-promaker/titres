import { useState } from "react";
import type { Societe } from "../types";
import { lireFeuilleXlsx, texteColonne } from "../lib/xlsxImport";

interface Props {
  societes: Societe[];
  onImport: (noms: string[]) => Promise<{ ajoutees: number; erreurs: string[] }>;
}

export function ImportSocietes({ societes, onImport }: Props) {
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<string[]>([]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;

    setEnCours(true);
    setResultat(null);
    setErreurs([]);

    try {
      const lignes = await lireFeuilleXlsx(fichier);
      const existants = new Set(societes.map((s) => s.nom.trim().toLowerCase()));
      const vus = new Set<string>();
      const aAjouter: string[] = [];
      const ignorees: string[] = [];

      lignes.forEach((ligne, i) => {
        const nom = texteColonne(ligne, "nom", "société", "societe");
        if (!nom) return;
        const cle = nom.toLowerCase();
        if (existants.has(cle) || vus.has(cle)) {
          ignorees.push(`Ligne ${i + 2} : « ${nom} » déjà présente, ignorée.`);
          return;
        }
        vus.add(cle);
        aAjouter.push(nom);
      });

      if (aAjouter.length === 0 && ignorees.length === 0) {
        setErreurs(["Aucune colonne « Nom » reconnue, ou fichier vide."]);
        return;
      }

      const { ajoutees, erreurs: erreursImport } = await onImport(aAjouter);
      setResultat(`${ajoutees} société(s) ajoutée(s).`);
      setErreurs([...ignorees, ...erreursImport]);
    } catch {
      setErreurs(["Impossible de lire ce fichier. Vérifiez qu'il s'agit bien d'un .xlsx valide."]);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="import-xlsx">
      <label className="btn btn-secondary btn-small import-label">
        {enCours ? "Import en cours…" : "Importer depuis un fichier Excel (.xlsx)"}
        <input type="file" accept=".xlsx" onChange={handleFile} disabled={enCours} hidden />
      </label>
      <p className="import-hint">Colonne attendue : « Nom ».</p>
      {resultat && <p className="import-result">{resultat}</p>}
      {erreurs.length > 0 && (
        <ul className="import-errors">
          {erreurs.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
