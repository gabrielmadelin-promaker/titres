import { useState } from "react";
import type { Societe, Transaction } from "../types";
import { dateExcelVersIso, lireFeuilleXlsx, nombreColonne, texteColonne, valeurColonne } from "../lib/xlsxImport";

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

        if (!nomAcheteur) {
          lignesErreurs.push(`Ligne ${numeroLigne} : société acheteuse manquante.`);
          return;
        }
        const cible = trouverSociete(nomCible);
        if (!cible) {
          lignesErreurs.push(`Ligne ${numeroLigne} : société cible « ${nomCible} » introuvable — importez d'abord les sociétés.`);
          return;
        }
        // Une société acheteuse non trouvée dans la liste suivie est traitée
        // comme hors groupe (nom libre) plutôt que comme une erreur : le
        // groupe Bolloré achète et vend aussi à des tiers externes.
        const acheteur = trouverSociete(nomAcheteur);
        if (acheteur && acheteur.id === cible.id) {
          lignesErreurs.push(`Ligne ${numeroLigne} : acheteur et cible identiques (« ${nomAcheteur} »).`);
          return;
        }

        const nombreActions = nombreColonne(ligne, "nombre d'actions", "nombre actions");
        if (nombreActions === null || nombreActions === 0) {
          // Pas de conversion automatique depuis un ancien fichier en %
          // (pas de dénominateur fiable au moment de l'import) : message
          // explicite plutôt qu'un simple "champ manquant" si c'est le cas.
          const ancienCapital = valeurColonne(ligne, "capital", "pourcentage", "%", "pct");
          if (ancienCapital !== undefined && ancienCapital !== "") {
            lignesErreurs.push(
              `Ligne ${numeroLigne} : colonne « Capital (%) » détectée mais plus acceptée à l'import — renseignez « Nombre d'actions » (aucune conversion automatique possible sans le nombre total émis par la société cible).`,
            );
          } else {
            lignesErreurs.push(`Ligne ${numeroLigne} : nombre d'actions invalide ou manquant (requis, non nul).`);
          }
          return;
        }

        const dateBrute = valeurColonne(ligne, "date");
        const date = dateExcelVersIso(dateBrute);
        if (!date) {
          lignesErreurs.push(`Ligne ${numeroLigne} : date invalide (« ${String(dateBrute)} »).`);
          return;
        }

        // Même logique que pour l'acheteur : société vendeuse non trouvée
        // dans la liste suivie = hors groupe (nom libre), pas une erreur.
        const nomVendeur = texteColonne(ligne, "vendeur", "société vendeuse", "societe vendeuse");
        const vendeur = nomVendeur ? trouverSociete(nomVendeur) : undefined;

        valides.push({
          acheteurId: acheteur?.id ?? null,
          acheteurNomExterne: acheteur ? null : nomAcheteur,
          cibleId: cible.id,
          date,
          nombreDroitVoteTheorique: nombreColonne(
            ligne,
            "nombre de droits de vote théorique",
            "nombre de droits de vote theorique",
            "nombre dv théorique",
            "nombre dv theorique",
          ),
          nombreDroitVoteExercable: nombreColonne(
            ligne,
            "nombre de droits de vote exerçable",
            "nombre de droits de vote exercable",
            "nombre dv exerçable",
            "nombre dv exercable",
          ),
          vendeurId: vendeur?.id ?? null,
          vendeurNomExterne: nomVendeur && !vendeur ? nomVendeur : null,
          prixAction: nombreColonne(ligne, "prix de l'action", "prix action", "prix"),
          // Une seule ligne par transaction importée (pas de colonnes "par
          // Catégorie" dans le fichier) ; Compte : pas de colonne dédiée à
          // l'import — se complète ensuite au besoin depuis le tableau des
          // transactions, ou généré automatiquement à l'enregistrement.
          lignes: [
            {
              id: "",
              categorie: texteColonne(ligne, "catégorie", "categorie") || null,
              nombreActions,
              compteAcheteurId: null,
              compteVendeurId: null,
              // Calculée côté API, jamais importée.
              plusValue: null,
            },
          ],
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
        Colonnes : « Acheteur », « Cible », « Nombre d'actions » (non nul, négatif pour une vente), « Date »
        (requises) ; « Nombre de droits de vote théorique », « Nombre de droits de vote exerçable », « Catégorie »,
        « Vendeur », « Prix de l'action » (facultatives). « Cible » doit être
        une société déjà importée ; « Acheteur »/« Vendeur » non reconnus sont importés tels quels comme sociétés
        hors groupe. Les pourcentages (anciens fichiers) ne sont plus acceptés à l'import : ils sont désormais
        calculés automatiquement à partir du nombre d'actions et du total émis par la société cible.
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
