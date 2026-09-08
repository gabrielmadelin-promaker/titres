import type { Transaction } from "../types";

export type Metrique = "capital" | "nombreActions" | "droitVoteTheorique" | "droitVoteExercable";

/**
 * Seul le capital et les droits de vote se composent en chaîne (50% de 40%
 * = 20% indirect) : ce sont des parts d'un tout ramené à 100. Un nombre
 * d'actions est une quantité absolue — multiplier deux nombres d'actions
 * entre eux n'a pas de sens dimensionnel sans connaître le nombre total
 * d'actions de chaque société intermédiaire, une donnée qu'on ne modélise
 * pas ici. Pour ce indicateur, le "total" se limite donc au direct.
 */
const METRIQUES: Record<Metrique, { extraire: (t: Transaction) => number | null; chainable: boolean }> = {
  capital: { extraire: (t) => t.capital, chainable: true },
  nombreActions: { extraire: (t) => t.nombreActions, chainable: false },
  droitVoteTheorique: { extraire: (t) => t.droitVoteTheorique, chainable: true },
  droitVoteExercable: { extraire: (t) => t.droitVoteExercable, chainable: true },
};

export interface Participation {
  acheteurId: string;
  cibleId: string;
  /** Somme des valeurs acquises lors des transactions de ce couple, pour la métrique choisie. */
  valeurTotale: number;
  nombreTransactions: number;
}

/**
 * Consolide les transactions par couple (actionnaire, société détenue) pour
 * une métrique donnée (capital, nombre d'actions, droit de vote...) : la
 * valeur détenue est la simple somme des valeurs acquises.
 *
 * Si `dateLimite` est fournie, seules les transactions antérieures ou
 * égales à cette date sont prises en compte — pour reconstituer la
 * répartition du capital telle qu'elle était à cette date.
 */
export function calculerParticipations(
  transactions: Transaction[],
  metrique: Metrique,
  dateLimite?: string,
): Participation[] {
  const extraire = METRIQUES[metrique].extraire;
  const transactionsPertinentes = dateLimite ? transactions.filter((t) => t.date <= dateLimite) : transactions;

  const parCouple = new Map<string, Participation>();

  for (const t of transactionsPertinentes) {
    const valeur = extraire(t);
    if (valeur === null || valeur === undefined) continue;
    const cle = `${t.acheteurId}::${t.cibleId}`;
    const existante = parCouple.get(cle);

    if (!existante) {
      parCouple.set(cle, {
        acheteurId: t.acheteurId,
        cibleId: t.cibleId,
        valeurTotale: valeur,
        nombreTransactions: 1,
      });
      continue;
    }

    existante.valeurTotale += valeur;
    existante.nombreTransactions += 1;
  }

  return [...parCouple.values()];
}

export interface ParticipationDetaillee {
  acheteurId: string;
  cibleId: string;
  /** Valeur acquise directement (somme des transactions directes de ce couple). */
  valeurDirecte: number;
  /** Valeur totale "look-through" : directe + indirecte via les sociétés intermédiaires détenues (= directe si la métrique n'est pas "chainable"). */
  valeurTotale: number;
}

const SEUIL_PARTICIPATION = 0.001;

function construireDirect(
  transactions: Transaction[],
  metrique: Metrique,
  dateLimite?: string,
): Map<string, Map<string, number>> {
  const directs = calculerParticipations(transactions, metrique, dateLimite);
  const direct = new Map<string, Map<string, number>>();
  directs.forEach((p) => {
    if (!direct.has(p.acheteurId)) direct.set(p.acheteurId, new Map());
    direct.get(p.acheteurId)!.set(p.cibleId, p.valeurTotale);
  });
  return direct;
}

/**
 * Comme calculerParticipations, mais ajoute la part détenue *indirectement*
 * via les sociétés intermédiaires : si A détient 50% de B et B détient 40%
 * de C, A détient indirectement 50% × 40% = 20% de C (en plus d'une
 * éventuelle part directe A→C). Uniquement pour les métriques "chainable"
 * (capital, droits de vote) — voir METRIQUES ci-dessus.
 *
 * La part indirecte est la somme, sur tous les *chemins simples* (chaque
 * société traversée au plus une fois) de A vers la cible, du produit des
 * valeurs le long du chemin. C'est essentiel en présence de participations
 * croisées (cycles) : une définition qui autoriserait à repasser plusieurs
 * fois par la même boucle réinjecterait indéfiniment la même participation
 * sous-jacente à chaque tour, et ferait dépasser 100 % même à des sociétés
 * qui, en réalité, n'ont jamais pu être détenues à plus de 100 % de leur
 * capital. En n'autorisant qu'un seul passage par société et par chemin,
 * chaque tranche n'est comptée qu'une fois par chaîne de détention distincte.
 */
export function calculerParticipationsDetaillees(
  transactions: Transaction[],
  metrique: Metrique,
  dateLimite?: string,
): ParticipationDetaillee[] {
  const direct = construireDirect(transactions, metrique, dateLimite);

  if (!METRIQUES[metrique].chainable) {
    const resultat: ParticipationDetaillee[] = [];
    direct.forEach((parCible, acheteurId) => {
      parCible.forEach((valeur, cibleId) => {
        if (Math.abs(valeur) < SEUIL_PARTICIPATION) return;
        resultat.push({ acheteurId, cibleId, valeurDirecte: valeur, valeurTotale: valeur });
      });
    });
    return resultat;
  }

  // Garde-fou : borne le nombre de chemins explorés au total, pour éviter
  // une explosion combinatoire sur un graphe très dense (beaucoup de
  // sociétés avec beaucoup de participations croisées entre elles). Les
  // chemins déjà comptés avant d'atteindre ce plafond restent valables.
  let budget = 2_000_000;

  const resultat: ParticipationDetaillee[] = [];

  for (const depart of direct.keys()) {
    const totalParCible = new Map<string, number>();
    const visitees = new Set<string>([depart]);

    function explorer(courant: string, valeurAccumulee: number): void {
      if (budget <= 0) return;
      for (const [suivant, valeur] of direct.get(courant) ?? []) {
        if (budget-- <= 0) return;
        if (visitees.has(suivant)) continue; // chemin simple : jamais deux fois la même société
        const nouvelleValeur = (valeurAccumulee * valeur) / 100;
        if (Math.abs(nouvelleValeur) < SEUIL_PARTICIPATION) continue;
        totalParCible.set(suivant, (totalParCible.get(suivant) ?? 0) + nouvelleValeur);
        visitees.add(suivant);
        explorer(suivant, nouvelleValeur);
        visitees.delete(suivant);
      }
    }
    explorer(depart, 100);

    totalParCible.forEach((valeurTotale, cibleId) => {
      resultat.push({
        acheteurId: depart,
        cibleId,
        valeurDirecte: direct.get(depart)?.get(cibleId) ?? 0,
        valeurTotale,
      });
    });
  }

  return resultat;
}

export interface CheminParticipation {
  /** Sociétés traversées, de l'actionnaire de départ à la cible (bornes incluses), dans l'ordre. */
  societeIds: string[];
  /** Valeur de chaque maillon (societeIds[i] → societeIds[i+1]) — un de moins que societeIds. */
  valeurs: number[];
  /** Produit de tous les maillons : ce que ce chemin, à lui seul, apporte au total détenu. */
  contribution: number;
}

/**
 * Détaille, pour un couple (actionnaire, société détenue) précis, la liste
 * des chemins de détention (directs et indirects) qui composent sa valeur
 * totale pour la métrique choisie — la cascade à l'origine de ce chiffre.
 * La somme des `contribution` de tous les chemins retournés reconstitue
 * exactement `valeurTotale` tel que calculé par calculerParticipationsDetaillees.
 * Pour une métrique non "chainable" (nombre d'actions), renvoie uniquement
 * le lien direct s'il existe.
 *
 * Triés par contribution décroissante : les chaînes de détention les plus
 * significatives d'abord.
 */
export function calculerCheminsParticipation(
  transactions: Transaction[],
  acheteurId: string,
  cibleId: string,
  metrique: Metrique,
  dateLimite?: string,
): CheminParticipation[] {
  const direct = construireDirect(transactions, metrique, dateLimite);

  if (!METRIQUES[metrique].chainable) {
    const valeur = direct.get(acheteurId)?.get(cibleId);
    return valeur && Math.abs(valeur) > SEUIL_PARTICIPATION
      ? [{ societeIds: [acheteurId, cibleId], valeurs: [valeur], contribution: valeur }]
      : [];
  }

  const chemins: CheminParticipation[] = [];
  const chemin: string[] = [acheteurId];
  const valeurs: number[] = [];
  const visitees = new Set<string>([acheteurId]);
  let budget = 500_000;

  function explorer(courant: string, valeurAccumulee: number): void {
    if (budget <= 0) return;
    for (const [suivant, valeur] of direct.get(courant) ?? []) {
      if (budget-- <= 0) return;
      if (visitees.has(suivant)) continue; // chemin simple : jamais deux fois la même société
      const nouvelleValeur = (valeurAccumulee * valeur) / 100;
      if (Math.abs(nouvelleValeur) < SEUIL_PARTICIPATION) continue;

      chemin.push(suivant);
      valeurs.push(valeur);
      if (suivant === cibleId) {
        // Chemin complet jusqu'à la cible : on l'enregistre, sans continuer
        // au-delà (la suite représenterait la détention d'une AUTRE société,
        // pas de celle-ci).
        chemins.push({ societeIds: [...chemin], valeurs: [...valeurs], contribution: nouvelleValeur });
      } else {
        visitees.add(suivant);
        explorer(suivant, nouvelleValeur);
        visitees.delete(suivant);
      }
      chemin.pop();
      valeurs.pop();
    }
  }
  explorer(acheteurId, 100);

  return chemins.sort((a, b) => b.contribution - a.contribution);
}

/**
 * Valeur globale (capital, nombre d'actions, droit de vote...) cédée par la
 * société : simple somme des valeurs acquises lors de ses transactions.
 */
export function valeurGlobale(
  societeId: string,
  transactions: Transaction[],
  metrique: Metrique,
  dateLimite?: string,
): number | null {
  const extraire = METRIQUES[metrique].extraire;
  const pertinentes = transactions.filter(
    (t) => t.cibleId === societeId && (!dateLimite || t.date <= dateLimite),
  );
  let somme = 0;
  let trouve = false;
  for (const t of pertinentes) {
    const valeur = extraire(t);
    if (valeur === null || valeur === undefined) continue;
    somme += valeur;
    trouve = true;
  }
  return trouve ? somme : null;
}
