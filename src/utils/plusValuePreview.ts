import type { Titre } from "../types";

/**
 * Aperçu en direct de la plus-value qu'une ligne de transaction en cours de
 * saisie générerait, avant tout enregistrement — même logique FIFO que
 * PlusValueService.CalculerPlusValues côté serveur (voir aussi
 * TitresLotsService.RecalculerTousLesLots), mais appliquée aux lots déjà
 * connus du client (`actions`, chargés via /api/titres/actions) plutôt
 * qu'une réécriture complète : un simple aperçu, pas une valeur engagée —
 * le serveur recalculera la vraie valeur à l'enregistrement, qui peut
 * différer si d'autres transactions sont saisies entre-temps.
 *
 * Un détenteur hors groupe (id null) n'a jamais de lot suivi (voir
 * ComptesService.ResoudreCompte/TitresLotsService côté serveur) : aucun
 * aperçu n'est alors possible, pas plus qu'au serveur.
 */
export function apercuPlusValue(
  actions: Titre[],
  cibleId: string,
  categorie: string,
  acheteurId: string | null,
  compteAcheteurId: string,
  vendeurId: string | null,
  compteVendeurId: string,
  nombreActions: number,
  prixAction: number,
): number | null {
  if (!nombreActions || !Number.isFinite(prixAction)) return null;
  if (vendeurId !== null && vendeurId === acheteurId) return null;

  // Camp perdant (dont les lots sont consommés) : l'acheteur si la ligne
  // représente une vente (nombreActions négatif), le vendeur sinon — même
  // convention que TitresLotsService.AppliquerLigne.
  const detenteurPerdantId = nombreActions < 0 ? acheteurId : vendeurId;
  const comptePerdant = nombreActions < 0 ? compteAcheteurId : compteVendeurId;
  if (detenteurPerdantId === null) return null;

  const categorieNormalisee = categorie.trim() || null;
  const lots = actions
    .filter(
      (a) =>
        a.societeEmettriceId === cibleId &&
        (a.categorie ?? null) === categorieNormalisee &&
        a.societeDetentriceId === detenteurPerdantId &&
        // Compte explicitement choisi : ne retient que ses lots. Sinon
        // ("Auto"), on ne sait pas encore lequel sera résolu à
        // l'enregistrement : on retient tous les comptes de ce détenteur.
        (!comptePerdant || a.compteId === comptePerdant),
    )
    .sort((a, b) => (a.dateAcquisition ?? "").localeCompare(b.dateAcquisition ?? ""));

  let restant = Math.abs(nombreActions);
  let sommePrixPondere = 0;
  let sommeQuantiteConsommee = 0;
  for (const lot of lots) {
    if (restant <= 0) break;
    const consomme = Math.min(lot.quantite, restant);
    if (lot.prixInitial !== null) {
      sommePrixPondere += lot.prixInitial * consomme;
      sommeQuantiteConsommee += consomme;
    }
    restant -= consomme;
  }
  if (sommeQuantiteConsommee <= 0) return null;

  const prixInitialMoyen = sommePrixPondere / sommeQuantiteConsommee;
  return Math.abs(nombreActions) * (prixAction - prixInitialMoyen);
}
