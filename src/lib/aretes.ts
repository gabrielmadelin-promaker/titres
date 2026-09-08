import { formatNombre } from "./format";
import { BOX_H, BOX_W, COL_GAP, GAP_GROUPE, ROW_GAP, type Organigramme } from "./organigramme";

export interface Point {
  x: number;
  y: number;
}

export interface AreteAffichee {
  cle: string;
  /** Tracé complet, sous forme de segments droits successifs (coude compris). */
  points: Point[];
  /** Même tracé, prêt pour l'attribut `d` d'un `<path>` SVG. */
  d: string;
  labelMx: number;
  labelY: number;
  labelWidth: number;
  label: string;
  retour: boolean;
}

function versD(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

/**
 * Les longs sauts sont routés dans un couloir vertical à côté d'une colonne
 * de boîtes ; ce couloir peut tomber pile sur la liste d'actionnaires
 * groupés d'une société d'un niveau intermédiaire (accolée au bord droit de
 * sa boîte). On décale alors le couloir juste après ce panneau.
 */
function eviterPanneaux(
  candidatX: number,
  yMin: number,
  yMax: number,
  panneaux: { x1: number; x2: number; y1: number; y2: number }[],
): number {
  let x = candidatX;
  for (let i = 0; i < 5; i++) {
    const conflit = panneaux.find((p) => x >= p.x1 - 4 && x <= p.x2 + 4 && yMax > p.y1 && yMin < p.y2);
    if (!conflit) return x;
    x = conflit.x2 + 6;
  }
  return x;
}

/**
 * Répartit les points d'arrivée (et de départ) d'un même nœud le long de la
 * largeur de sa boîte, dans l'ordre horizontal des boîtes en face — sinon
 * les lignes se croisent et les étiquettes se chevauchent.
 */
export function calculerAretes(organigramme: Organigramme): AreteAffichee[] {
  const noeudDe = new Map(organigramme.noeuds.map((n) => [n.id, n]));
  const liensDirects = organigramme.liens.filter((l) => !l.retour && !l.lateral);
  const panneauxGroupes = organigramme.noeuds
    .filter((n) => n.largeurGroupe > 0)
    .map((n) => ({
      x1: n.x + BOX_W + GAP_GROUPE,
      x2: n.x + BOX_W + GAP_GROUPE + n.largeurGroupe,
      y1: n.y,
      y2: n.y + BOX_H,
    }));

  function rangsTries(
    cle: (l: (typeof liensDirects)[number]) => string,
    ordonneParX: (l: (typeof liensDirects)[number]) => number,
  ) {
    const groupes = new Map<string, number[]>();
    liensDirects.forEach((l, i) => {
      const k = cle(l);
      if (!groupes.has(k)) groupes.set(k, []);
      groupes.get(k)!.push(i);
    });
    const rang = new Map<number, { rang: number; total: number }>();
    groupes.forEach((indices) => {
      const tries = [...indices].sort((i1, i2) => ordonneParX(liensDirects[i1]) - ordonneParX(liensDirects[i2]));
      tries.forEach((i, r) => rang.set(i, { rang: r, total: tries.length }));
    });
    return rang;
  }

  const rangsDepart = rangsTries(
    (l) => l.acheteurId,
    (l) => noeudDe.get(l.cibleId)?.x ?? 0,
  );
  const rangsArrivee = rangsTries(
    (l) => l.cibleId,
    (l) => noeudDe.get(l.acheteurId)?.x ?? 0,
  );

  let compteurLongueDistance = 0;
  let compteurRetour = 0;

  const aretesDirectes = liensDirects
    .map((lien, index) => {
      const parent = noeudDe.get(lien.acheteurId);
      const enfant = noeudDe.get(lien.cibleId);
      if (!parent || !enfant) return null;

      const { rang: rangA, total: totalA } = rangsArrivee.get(index) ?? { rang: 0, total: 1 };
      const x2 = enfant.x + (BOX_W * (rangA + 1)) / (totalA + 1);
      const y2 = enfant.y;

      const { rang: rangD, total: totalD } = rangsDepart.get(index) ?? { rang: 0, total: 1 };
      const x1 = parent.x + (BOX_W * (rangD + 1)) / (totalD + 1);
      const y1 = parent.y + BOX_H;

      // Quand 2 flèches arrivent sur la même boîte, leur dernier segment
      // horizontal est en plus réparti verticalement dans le couloir vide
      // au-dessus de la cible, pour ne jamais superposer les étiquettes.
      const bandeH = ROW_GAP - 18;
      const offsetArrivee = totalA > 1 ? -bandeH / 2 + ((rangA + 0.5) * bandeH) / totalA : 0;

      let points: Point[];
      let labelMx: number;
      let labelY: number;

      if (enfant.niveau - parent.niveau <= 1) {
        const gutterY = y2 - ROW_GAP / 2 + offsetArrivee;
        points = [
          { x: x1, y: y1 },
          { x: x1, y: gutterY },
          { x: x2, y: gutterY },
          { x: x2, y: y2 },
        ];
        labelMx = (x1 + x2) / 2;
        labelY = gutterY;
      } else {
        // Lien qui saute plusieurs niveaux : la portion verticale longue est
        // déportée dans un couloir à côté de la colonne du parent, décalé
        // d'un lien "long" à l'autre pour ne pas se superposer aux autres.
        const decalage = (compteurLongueDistance % 3) * 7;
        compteurLongueDistance += 1;
        const laneDroite = parent.x + BOX_W + COL_GAP / 2 + decalage;
        const laneCandidate =
          laneDroite + BOX_W / 2 <= organigramme.largeur - 4 ? laneDroite : parent.x - COL_GAP / 2 - decalage;
        const gutter1 = parent.y + BOX_H + ROW_GAP / 2;
        const gutterDernier = y2 - ROW_GAP / 2 + offsetArrivee;
        const laneX = eviterPanneaux(
          laneCandidate,
          Math.min(gutter1, gutterDernier),
          Math.max(gutter1, gutterDernier),
          panneauxGroupes,
        );
        points = [
          { x: x1, y: y1 },
          { x: x1, y: gutter1 },
          { x: laneX, y: gutter1 },
          { x: laneX, y: gutterDernier },
          { x: x2, y: gutterDernier },
          { x: x2, y: y2 },
        ];
        labelMx = (laneX + x2) / 2;
        labelY = gutterDernier;
      }

      const label = formatNombre(lien.pourcentage);
      const labelWidth = label.length * 6.6 + 10;
      return { cle: `${lien.acheteurId}::${lien.cibleId}`, points, d: versD(points), labelMx, labelY, labelWidth, label, retour: false };
    })
    .filter((a): a is AreteAffichee => a !== null);

  const aretesRetour = organigramme.liens
    .filter((l) => l.retour)
    .map((lien) => {
      const parent = noeudDe.get(lien.acheteurId);
      const enfant = noeudDe.get(lien.cibleId);
      if (!parent || !enfant) return null;

      // Participation croisée : entre/sort toujours par le haut ou le bas
      // des boîtes, jamais par le côté (qui devrait alors traverser les
      // boîtes voisines de la même rangée) ; rejoint l'autre bout par la
      // marge de droite du canevas plutôt que de supposer que la cible est
      // sous le parent — faux ici par définition. Quand la cible est plus
      // haute que le parent (cas le plus courant, boucle "vers le haut"),
      // on sort par le haut du parent et on entre par le bas de la cible.
      const decalage = (compteurRetour % 2) * 10;
      compteurRetour += 1;
      const versLeHaut = enfant.niveau < parent.niveau;
      const x1 = parent.x + BOX_W / 2;
      const y1 = versLeHaut ? parent.y : parent.y + BOX_H;
      const x2 = enfant.x + BOX_W / 2;
      const y2 = versLeHaut ? enfant.y + BOX_H : enfant.y;
      const laneX = organigramme.largeur - 20 - decalage;
      // Décalé à un quart (au lieu de la moitié) du couloir : les liens
      // normaux placent leur étiquette au milieu, ce décalage évite de
      // passer dessus.
      const corridorSource = versLeHaut ? parent.y - ROW_GAP * 0.25 : parent.y + BOX_H + ROW_GAP * 0.25;
      const corridorCible = versLeHaut ? enfant.y + BOX_H + ROW_GAP * 0.25 : enfant.y - ROW_GAP * 0.25;
      const points: Point[] = [
        { x: x1, y: y1 },
        { x: x1, y: corridorSource },
        { x: laneX, y: corridorSource },
        { x: laneX, y: corridorCible },
        { x: x2, y: corridorCible },
        { x: x2, y: y2 },
      ];

      const label = formatNombre(lien.pourcentage);
      const labelWidth = label.length * 6.6 + 10;
      return {
        cle: `${lien.acheteurId}::${lien.cibleId}::retour`,
        points,
        d: versD(points),
        labelMx: laneX,
        labelY: (corridorSource + corridorCible) / 2,
        labelWidth,
        label,
        retour: true,
      };
    })
    .filter((a): a is AreteAffichee => a !== null);

  // Liens "satellites" : la société actionnaire est positionnée juste à
  // gauche de sa cible, sur la même rangée — un simple trait de son bord
  // droit au bord gauche de la cible suffit, pas besoin de couloir. Quand
  // plusieurs satellites visent la même cible, leurs points d'arrivée sont
  // étagés verticalement le long du bord gauche de la boîte.
  const liensLateraux = organigramme.liens.filter((l) => l.lateral);
  const lateralParCible = new Map<string, typeof liensLateraux>();
  liensLateraux.forEach((l) => {
    if (!lateralParCible.has(l.cibleId)) lateralParCible.set(l.cibleId, []);
    lateralParCible.get(l.cibleId)!.push(l);
  });

  const aretesLaterales = liensLateraux
    .map((lien) => {
      const parent = noeudDe.get(lien.acheteurId);
      const enfant = noeudDe.get(lien.cibleId);
      if (!parent || !enfant) return null;

      const groupe = lateralParCible.get(lien.cibleId)!;
      const triees = [...groupe].sort(
        (a, b) => (noeudDe.get(b.acheteurId)?.x ?? 0) - (noeudDe.get(a.acheteurId)?.x ?? 0),
      );
      const rang = triees.findIndex((l) => l.acheteurId === lien.acheteurId);
      const total = triees.length;
      const bandeH = BOX_H - 10;
      const offset = total > 1 ? -bandeH / 2 + ((rang + 0.5) * bandeH) / total : 0;

      const x1 = parent.x + BOX_W;
      const y1 = parent.y + BOX_H / 2;
      const x2 = enfant.x;
      const y2 = enfant.y + BOX_H / 2 + offset;
      const points: Point[] = [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ];

      const label = formatNombre(lien.pourcentage);
      const labelWidth = label.length * 6.6 + 10;
      return {
        cle: `${lien.acheteurId}::${lien.cibleId}::lateral`,
        points,
        d: versD(points),
        labelMx: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2 - 6,
        labelWidth,
        label,
        retour: false,
      };
    })
    .filter((a): a is AreteAffichee => a !== null);

  return [...aretesDirectes, ...aretesLaterales, ...aretesRetour];
}
