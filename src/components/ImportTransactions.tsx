import { useState } from "react";
import { QUALIFICATIONS, type Qualification, type Societe, type Transaction } from "../types";
import { dateExcelVersIso, lireFeuilleXlsx, nombreColonne, texteColonne, valeurColonne } from "../lib/xlsxImport";

interface Props {
  societes: Societe[];
  onImport: (
    transactions: Omit<Transaction, "id">[],
  ) => Promise<{ ajoutees: number; erreurs: string[] }>;
}

function estQualificationValide(valeur: string): valeur is Qualification {
  return (QUALIFICATIONS as readonly string[]).includes(valeur);
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

        const capitalBrut = valeurColonne(ligne, "capital", "pourcentage", "%", "pct");
        const capital = Number(capitalBrut);
        if (!capitalBrut || Number.isNaN(capital) || capital === 0 || capital < -100 || capital > 100) {
          lignesErreurs.push(
            `Ligne ${numeroLigne} : capital (%) invalide (« ${String(capitalBrut)} », attendu entre -100 et 100, non nul).`,
          );
          return;
        }

        const dateBrute = valeurColonne(ligne, "date");
        const date = dateExcelVersIso(dateBrute);
        if (!date) {
          lignesErreurs.push(`Ligne ${numeroLigne} : date invalide (« ${String(dateBrute)} »).`);
          return;
        }

        const nomVendeur = texteColonne(ligne, "vendeur", "société vendeuse", "societe vendeuse");
        const vendeur = nomVendeur ? trouverSociete(nomVendeur) : undefined;
        if (nomVendeur && !vendeur) {
          lignesErreurs.push(`Ligne ${numeroLigne} : société vendeuse « ${nomVendeur} » introuvable, ignorée.`);
        }

        const qualificationBrute = texteColonne(ligne, "qualification") || "Simple";
        const qualification = estQualificationValide(qualificationBrute) ? qualificationBrute : "Simple";

        valides.push({
          acheteurId: acheteur.id,
          cibleId: cible.id,
          date,
          nombreActions: nombreColonne(ligne, "nombre d'actions", "nombre actions"),
          capital,
          droitVoteTheorique: nombreColonne(ligne, "droit de vote théorique", "droit de vote theorique", "dv théorique", "dv theorique"),
          droitVoteExercable: nombreColonne(ligne, "droit de vote exerçable", "droit de vote exercable", "dv exerçable", "dv exercable"),
          vendeurId: vendeur?.id ?? null,
          prixAction: nombreColonne(ligne, "prix de l'action", "prix action", "prix"),
          qualification,
        });
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
      <p className="import-hint">
        Colonnes : « Acheteur », « Cible », « Capital » (-100 à 100, négatif pour une vente), « Date » (requises) ;
        « Nombre d'actions », « Droit de vote théorique », « Droit de vote exerçable », « Vendeur », « Prix de
        l'action », « Qualification » (Simple/Fusion/TUPE — facultatives).
      </p>
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
