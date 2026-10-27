import type { Societe, Transaction } from "../types";

export type Metrique =
  | "capital"
  | "nombreActions"
  | "droitVoteTheorique"
  | "droitVoteExercable"
  | "nombreDroitVoteTheorique"
  | "nombreDroitVoteExercable";

type ChampTotalSociete = "nombreTotalActions" | "nombreTotalDroitVoteTheorique" | "nombreTotalDroitVoteExercable";

/**
 * Un pourcentage (capital, droit de vote théorique/exerçable) n'est jamais
 * saisi ni stocké : il se dérive uniquement de la quantité correspondante
 * de la transaction (nombre d'actions / de DV théorique / de DV
 * exerçable), rapportée au total émis par la société cible (NombreTotalX,
 * saisi une fois sur la société). Null si l'un des deux manque — pas de
 * quantité sur la transaction, ou pas de total configuré sur la société :
 * aucun repli sur l'ancien pourcentage historique (Capital/
 * DroitVoteTheorique/DroitVoteExercable), qui n'est plus jamais lu (voir
 * le backfill one-shot 2026-10-27-backfill-quantites-depuis-pourcentages.sql,
 * qui convertit ces anciennes transactions en quantité équivalente dès que
 * leur société cible a un total renseigné).
 */
function extrairePourcentage(
  nombre: number | null,
  cibleId: string,
  societes: Societe[],
  champTotal: ChampTotalSociete,
): number | null {
  const total = societes.find((s) => s.id === cibleId)?.[champTotal] ?? null;
  if (nombre === null || !total) return null;
  return (nombre / total) * 100;
}

/**
 * Seul le capital et les droits de vote se composent en chaîne (50% de 40%
 * = 20% indirect) : ce sont des parts d'un tout ramené à 100. Un nombre
 * d'actions (ou de droits de vote) est une quantité absolue — multiplier
 * deux quantités entre elles n'a pas de sens dimensionnel sans connaître le
 * nombre total émis par chaque société intermédiaire, ce qui n'est pas pris
 * en compte ici (c'est précisément le rôle de la dérivation en %). Pour ces
 * indicateurs "nombre", le "total" se limite donc au direct.
 */
const METRIQUES: Record<Metrique, { extraire: (t: Transaction, societes: Societe[]) => number | null; chainable: boolean }> = {
  capital: {
    extraire: (t, societes) => extrairePourcentage(t.nombreActions, t.cibleId, societes, "nombreTotalActions"),
    chainable: true,
  },
  droitVoteTheorique: {
    extraire: (t, societes) =>
      extrairePourcentage(t.nombreDroitVoteTheorique, t.cibleId, societes, "nombreTotalDroitVoteTheorique"),
    chainable: true,
  },
  droitVoteExercable: {
    extraire: (t, societes) =>
      extrairePourcentage(t.nombreDroitVoteExercable, t.cibleId, societes, "nombreTotalDroitVoteExercable"),
    chainable: true,
  },
  nombreActions: { extraire: (t) => t.nombreActions, chainable: false },
  nombreDroitVoteTheorique: { extraire: (t) => t.nombreDroitVoteTheorique, chainable: false },
  nombreDroitVoteExercable: { extraire: (t) => t.nombreDroitVoteExercable, chainable: false },
};

/**
 * Valeur d'une métrique pour une transaction précise — même dérivation que
 * dans les agrégats ci-dessous (nombre rapporté au total de la société
 * cible). Utilisé pour l'affichage brut d'une transaction (tableau des
 * transactions), indépendamment de tout agrégat par actionnaire.
 */
export function extraireValeurTransaction(t: Transaction, metrique: Metrique, societes: Societe[]): number | null {
  return METRIQUES[metrique].extraire(t, societes);
}

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
 * valeur détenue est la somme des valeurs acquises par l'acheteur, moins ce
 * qu'une éventuelle société vendeuse SUIVIE (vendeurId) a cédé au même
 * couple — les actions vendues par C à A viennent de la participation de C,
 * pas de nulle part : sans cette contrepartie, la part de C dans la cible
 * resterait inchangée tant que personne n'a saisi une seconde transaction
 * pour l'en déduire à la main, et le total détenu par le groupe serait
 * gonflé du montant transféré (double compte).
 *
 * Si `dateLimite` est fournie, seules les transactions antérieures ou
 * égales à cette date sont prises en compte — pour reconstituer la
 * répartition du capital telle qu'elle était à cette date.
 */
export function calculerParticipations(
  transactions: Transaction[],
  metrique: Metrique,
  societes: Societe[],
  dateLimite?: string,
): Participation[] {
  const extraire = METRIQUES[metrique].extraire;
  const transactionsPertinentes = transactions.filter((t) => !dateLimite || t.date <= dateLimite);

  const parCouple = new Map<string, Participation>();

  function ajouter(acheteurId: string, cibleId: string, valeur: number) {
    const cle = `${acheteurId}::${cibleId}`;
    const existante = parCouple.get(cle);
    if (!existante) {
      parCouple.set(cle, { acheteurId, cibleId, valeurTotale: valeur, nombreTransactions: 1 });
      return;
    }
    existante.valeurTotale += valeur;
    existante.nombreTransactions += 1;
  }

  for (const t of transactionsPertinentes) {
    const valeur = extraire(t, societes);
    if (valeur === null || valeur === undefined) continue;
    // Un acheteur hors groupe (acheteurId null, nom libre) n'est pas une
    // société suivie : impossible de le faire figurer comme actionnaire
    // (ni, a fortiori, de chaîner au-delà) — cette transaction reste
    // visible dans le tableau des transactions, simplement pas ici.
    if (t.acheteurId !== null) ajouter(t.acheteurId, t.cibleId, valeur);
    // Symétrique côté vendeur, uniquement si c'est une société suivie et
    // différente de l'acheteur (un auto-échange n'a pas de sens).
    if (t.vendeurId !== null && t.vendeurId !== t.acheteurId) ajouter(t.vendeurId, t.cibleId, -valeur);
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
  societes: Societe[],
  dateLimite?: string,
): Map<string, Map<string, number>> {
  const directs = calculerParticipations(transactions, metrique, societes, dateLimite);
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
  societes: Societe[],
  dateLimite?: string,
): ParticipationDetaillee[] {
  const direct = construireDirect(transactions, metrique, societes, dateLimite);

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
  societes: Societe[],
  dateLimite?: string,
): CheminParticipation[] {
  const direct = construireDirect(transactions, metrique, societes, dateLimite);

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
 * Valeur globale (capital, nombre d'actions, droit de vote...) détenue par
 * l'ensemble des sociétés suivies dans la société cible : la somme des
 * participations directes de chaque actionnaire suivi (même calcul que
 * calculerParticipations, agrégé sur tous les actionnaires plutôt que par
 * couple). Une cession où l'acheteur ET le vendeur sont tous deux des
 * sociétés suivies est un simple transfert interne, sans effet sur ce
 * total (les actions étaient déjà comptées via la participation existante
 * du vendeur) ; mais dès qu'un seul des deux camps est hors groupe, les
 * actions entrent dans le groupe (achat) ou en sortent (vente à un tiers)
 * et doivent bien faire varier ce total.
 */
export function valeurGlobale(
  societeId: string,
  transactions: Transaction[],
  metrique: Metrique,
  societes: Societe[],
  dateLimite?: string,
): number | null {
  const extraire = METRIQUES[metrique].extraire;
  const pertinentes = transactions.filter(
    (t) => t.cibleId === societeId && (!dateLimite || t.date <= dateLimite),
  );
  let somme = 0;
  let trouve = false;
  for (const t of pertinentes) {
    const valeur = extraire(t, societes);
    if (valeur === null || valeur === undefined) continue;
    trouve = true;
    if (t.acheteurId !== null) somme += valeur;
    if (t.vendeurId !== null && t.vendeurId !== t.acheteurId) somme -= valeur;
  }
  return trouve ? somme : null;
}
