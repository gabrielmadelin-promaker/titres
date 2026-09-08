import type { Transaction } from "../types";

export interface Participation {
  acheteurId: string;
  cibleId: string;
  /** Somme des pourcentages acquis lors des transactions de ce couple. */
  pourcentageTotal: number;
  nombreTransactions: number;
}

/**
 * Consolide les transactions par couple (actionnaire, société détenue) : le
 * pourcentage détenu est la simple somme des pourcentages acquis.
 *
 * Si `dateLimite` est fournie, seules les transactions antérieures ou
 * égales à cette date sont prises en compte — pour reconstituer la
 * répartition du capital telle qu'elle était à cette date.
 */
export function calculerParticipations(
  transactions: Transaction[],
  dateLimite?: string,
): Participation[] {
  const transactionsPertinentes = dateLimite
    ? transactions.filter((t) => t.date <= dateLimite)
    : transactions;

  const parCouple = new Map<string, Participation>();

  for (const t of transactionsPertinentes) {
    const cle = `${t.acheteurId}::${t.cibleId}`;
    const existante = parCouple.get(cle);

    if (!existante) {
      parCouple.set(cle, {
        acheteurId: t.acheteurId,
        cibleId: t.cibleId,
        pourcentageTotal: t.pourcentage,
        nombreTransactions: 1,
      });
      continue;
    }

    existante.pourcentageTotal += t.pourcentage;
    existante.nombreTransactions += 1;
  }

  return [...parCouple.values()];
}

export interface ParticipationDetaillee {
  acheteurId: string;
  cibleId: string;
  /** Part acquise directement (somme des transactions directes de ce couple). */
  pourcentageDirect: number;
  /** Part totale "look-through" : directe + indirecte via les sociétés intermédiaires détenues. */
  pourcentageTotal: number;
}

const SEUIL_PARTICIPATION = 0.001;

function construireDirect(transactions: Transaction[], dateLimite?: string): Map<string, Map<string, number>> {
  const directs = calculerParticipations(transactions, dateLimite);
  const direct = new Map<string, Map<string, number>>();
  directs.forEach((p) => {
    if (!direct.has(p.acheteurId)) direct.set(p.acheteurId, new Map());
    direct.get(p.acheteurId)!.set(p.cibleId, p.pourcentageTotal);
  });
  return direct;
}

/**
 * Comme calculerParticipations, mais ajoute la part détenue *indirectement*
 * via les sociétés intermédiaires : si A détient 50% de B et B détient 40%
 * de C, A détient indirectement 50% × 40% = 20% de C (en plus d'une
 * éventuelle part directe A→C).
 *
 * La part indirecte est la somme, sur tous les *chemins simples* (chaque
 * société traversée au plus une fois) de A vers la cible, du produit des
 * pourcentages le long du chemin. C'est essentiel en présence de
 * participations croisées (cycles) : une définition qui autoriserait à
 * repasser plusieurs fois par la même boucle réinjecterait indéfiniment la
 * même participation sous-jacente à chaque tour, et ferait dépasser 100 %
 * même à des sociétés qui, en réalité, n'ont jamais pu être détenues à plus
 * de 100 % de leur capital. En n'autorisant qu'un seul passage par société
 * et par chemin, chaque tranche de capital n'est comptée qu'une fois par
 * chaîne de détention distincte.
 */
export function calculerParticipationsDetaillees(
  transactions: Transaction[],
  dateLimite?: string,
): ParticipationDetaillee[] {
  const direct = construireDirect(transactions, dateLimite);

  // Garde-fou : borne le nombre de chemins explorés au total, pour éviter
  // une explosion combinatoire sur un graphe très dense (beaucoup de
  // sociétés avec beaucoup de participations croisées entre elles). Les
  // chemins déjà comptés avant d'atteindre ce plafond restent valables.
  let budget = 2_000_000;

  const resultat: ParticipationDetaillee[] = [];

  for (const depart of direct.keys()) {
    const totalParCible = new Map<string, number>();
    const visitees = new Set<string>([depart]);

    function explorer(courant: string, pctAccumule: number): void {
      if (budget <= 0) return;
      for (const [suivant, pct] of direct.get(courant) ?? []) {
        if (budget-- <= 0) return;
        if (visitees.has(suivant)) continue; // chemin simple : jamais deux fois la même société
        const nouveauPct = (pctAccumule * pct) / 100;
        if (Math.abs(nouveauPct) < SEUIL_PARTICIPATION) continue;
        totalParCible.set(suivant, (totalParCible.get(suivant) ?? 0) + nouveauPct);
        visitees.add(suivant);
        explorer(suivant, nouveauPct);
        visitees.delete(suivant);
      }
    }
    explorer(depart, 100);

    totalParCible.forEach((pourcentageTotal, cibleId) => {
      resultat.push({
        acheteurId: depart,
        cibleId,
        pourcentageDirect: direct.get(depart)?.get(cibleId) ?? 0,
        pourcentageTotal,
      });
    });
  }

  return resultat;
}

export interface CheminParticipation {
  /** Sociétés traversées, de l'actionnaire de départ à la cible (bornes incluses), dans l'ordre. */
  societeIds: string[];
  /** Pourcentage de chaque maillon (societeIds[i] → societeIds[i+1]) — un de moins que societeIds. */
  pourcentages: number[];
  /** Produit de tous les maillons : ce que ce chemin, à lui seul, apporte au total détenu. */
  contribution: number;
}

/**
 * Détaille, pour un couple (actionnaire, société détenue) précis, la liste
 * des chemins de détention (directs et indirects) qui composent son
 * "% détenu (total)" — la cascade à l'origine de ce chiffre. La somme des
 * `contribution` de tous les chemins retournés reconstitue exactement
 * `pourcentageTotal` tel que calculé par calculerParticipationsDetaillees.
 *
 * Triés par contribution décroissante : les chaînes de détention les plus
 * significatives d'abord.
 */
export function calculerCheminsParticipation(
  transactions: Transaction[],
  acheteurId: string,
  cibleId: string,
  dateLimite?: string,
): CheminParticipation[] {
  const direct = construireDirect(transactions, dateLimite);

  const chemins: CheminParticipation[] = [];
  const chemin: string[] = [acheteurId];
  const pourcentages: number[] = [];
  const visitees = new Set<string>([acheteurId]);
  let budget = 500_000;

  function explorer(courant: string, pctAccumule: number): void {
    if (budget <= 0) return;
    for (const [suivant, pct] of direct.get(courant) ?? []) {
      if (budget-- <= 0) return;
      if (visitees.has(suivant)) continue; // chemin simple : jamais deux fois la même société
      const nouveauPct = (pctAccumule * pct) / 100;
      if (Math.abs(nouveauPct) < SEUIL_PARTICIPATION) continue;

      chemin.push(suivant);
      pourcentages.push(pct);
      if (suivant === cibleId) {
        // Chemin complet jusqu'à la cible : on l'enregistre, sans continuer
        // au-delà (la suite représenterait la détention d'une AUTRE société,
        // pas de celle-ci).
        chemins.push({ societeIds: [...chemin], pourcentages: [...pourcentages], contribution: nouveauPct });
      } else {
        visitees.add(suivant);
        explorer(suivant, nouveauPct);
        visitees.delete(suivant);
      }
      chemin.pop();
      pourcentages.pop();
    }
  }
  explorer(acheteurId, 100);

  return chemins.sort((a, b) => b.contribution - a.contribution);
}

/**
 * Pourcentage global du capital de la société cédé : simple somme des
 * pourcentages acquis lors de ses transactions.
 */
export function pourcentageGlobal(
  societeId: string,
  transactions: Transaction[],
  dateLimite?: string,
): number | null {
  const pertinentes = transactions.filter(
    (t) => t.cibleId === societeId && (!dateLimite || t.date <= dateLimite),
  );
  if (pertinentes.length === 0) return null;
  return pertinentes.reduce((somme, t) => somme + t.pourcentage, 0);
}
