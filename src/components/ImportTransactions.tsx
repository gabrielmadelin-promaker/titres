import { useState } from "react";
import type { Societe, Transaction } from "../types";
import { dateExcelVersIso, lireFeuilleXlsx, texteColonne, valeurColonne } from "../lib/xlsxImport";

interface Props {
  societes: Societe[];
  onImport: (
    transactions: Omit<Transaction, "id">[],
  ) => Promise<{ ajoutees: number; erreurs: string[] }>;
}

export function ImportTransactions({ societes, onImport }: Props) {
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<string[]>([]);

  function trouverSociete(nom: string): Societe | undefined {
    const cle = nom.trim().toLowerCase();
    return societes.find((s) => s.nom.trim().toLowerCase() === cle);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;

    setEnCours(true);
    setResultat(null);
    setErreurs([]);

    try {
      const lignes = await lireFeuilleXlsx(fichier);
      const valides: Omit<Transaction, "id">[] = [];
      const lignesErreurs: string[] = [];

      lignes.forEach((ligne, i) => {
        const numeroLigne = i + 2;
        const nomAcheteur = texteColonne(ligne, "acheteur", "société acheteuse", "societe acheteuse");
        const nomCible = texteColonne(ligne, "cible", "société cible", "societe cible");
        if (!nomAcheteur && !nomCible) return;

        const acheteur = trouverSociete(nomAcheteur);
        const cible = trouverSociete(nomCible);
        if (!acheteur) {
          lignesErreurs.push(`Ligne ${numeroLigne} : société acheteuse « ${nomAcheteur} » introuvable — importez d'abord les sociétés.`);
          return;
        }
        if (!cible) {
          lignesErreurs.push(`Ligne ${numeroLigne} : société cible « ${nomCible} » introuvable — importez d'abord les sociétés.`);
          return;
        }
        if (acheteur.id === cible.id) {
          lignesErreurs.push(`Ligne ${numeroLigne} : acheteur et cible identiques (« ${nomAcheteur} »).`);
          return;
        }

        const pourcentageBrut = valeurColonne(ligne, "pourcentage", "%", "pct");
        const pourcentage = Number(pourcentageBrut);
        if (!pourcentageBrut || Number.isNaN(pourcentage) || pourcentage <= 0 || pourcentage > 100) {
          lignesErreurs.push(`Ligne ${numeroLigne} : pourcentage invalide (« ${String(pourcentageBrut)} », attendu entre 0 et 100).`);
          return;
        }

        const dateBrute = valeurColonne(ligne, "date");
        const date = dateExcelVersIso(dateBrute);
        if (!date) {
          lignesErreurs.push(`Ligne ${numeroLigne} : date invalide (« ${String(dateBrute)} »).`);
          return;
        }

        valides.push({ acheteurId: acheteur.id, cibleId: cible.id, pourcentage, date });
      });

      if (valides.length === 0 && lignesErreurs.length === 0) {
        setErreurs(["Aucune colonne « Acheteur »/« Cible » reconnue, ou fichier vide."]);
        return;
      }

      const { ajoutees, erreurs: erreursImport } = await onImport(valides);
      setResultat(`${ajoutees} transaction(s) ajoutée(s).`);
      setErreurs([...lignesErreurs, ...erreursImport]);
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
      <p className="import-hint">Colonnes attendues : « Acheteur », « Cible », « Pourcentage » (0-100), « Date ».</p>
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
