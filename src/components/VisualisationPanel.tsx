import { useEffect, useMemo, useRef, useState } from "react";
import type { Societe, Transaction } from "../types";
import { formatDate, formatNombre } from "../lib/format";
import {
  BOX_H,
  BOX_W,
  COL_GAP,
  GAP_GROUPE,
  LIGNE_GROUPE_H,
  ROW_GAP,
  calculerOrganigramme,
} from "../lib/organigramme";

interface Props {
  societes: Societe[];
  transactions: Transaction[];
}

interface AreteAffichee {
  cle: string;
  d: string;
  labelMx: number;
  labelY: number;
  labelWidth: number;
  label: string;
  retour: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Répartit les points d'arrivée (et de départ) d'un même nœud le long de la
 * largeur de sa boîte, dans l'ordre horizontal des boîtes en face — sinon
 * les lignes se croisent et les étiquettes se chevauchent.
 */
function calculerAretes(organigramme: ReturnType<typeof calculerOrganigramme>): AreteAffichee[] {
  const noeudDe = new Map(organigramme.noeuds.map((n) => [n.id, n]));
  const liensDirects = organigramme.liens.filter((l) => !l.retour);

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

      let d: string;
      let labelMx: number;
      let labelY: number;

      if (enfant.niveau - parent.niveau <= 1) {
        const gutterY = y2 - ROW_GAP / 2 + offsetArrivee;
        d = `M ${x1} ${y1} L ${x1} ${gutterY} L ${x2} ${gutterY} L ${x2} ${y2}`;
        labelMx = (x1 + x2) / 2;
        labelY = gutterY;
      } else {
        // Lien qui saute plusieurs niveaux : la portion verticale longue est
        // déportée dans un couloir à côté de la colonne du parent, décalé
        // d'un lien "long" à l'autre pour ne pas se superposer aux autres.
        const decalage = (compteurLongueDistance % 3) * 7;
        compteurLongueDistance += 1;
        const laneDroite = parent.x + BOX_W + COL_GAP / 2 + decalage;
        const laneX =
          laneDroite + BOX_W / 2 <= organigramme.largeur - 4 ? laneDroite : parent.x - COL_GAP / 2 - decalage;
        const gutter1 = parent.y + BOX_H + ROW_GAP / 2;
        const gutterDernier = y2 - ROW_GAP / 2 + offsetArrivee;
        d = `M ${x1} ${y1} L ${x1} ${gutter1} L ${laneX} ${gutter1} L ${laneX} ${gutterDernier} L ${x2} ${gutterDernier} L ${x2} ${y2}`;
        labelMx = (laneX + x2) / 2;
        labelY = gutterDernier;
      }

      const label = formatNombre(lien.pourcentage);
      const labelWidth = label.length * 6.6 + 10;
      return { cle: `${lien.acheteurId}::${lien.cibleId}`, d, labelMx, labelY, labelWidth, label, retour: false };
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
      const d =
        `M ${x1} ${y1} L ${x1} ${corridorSource} L ${laneX} ${corridorSource} ` +
        `L ${laneX} ${corridorCible} L ${x2} ${corridorCible} L ${x2} ${y2}`;

      const label = formatNombre(lien.pourcentage);
      const labelWidth = label.length * 6.6 + 10;
      return {
        cle: `${lien.acheteurId}::${lien.cibleId}::retour`,
        d,
        labelMx: laneX,
        labelY: (corridorSource + corridorCible) / 2,
        labelWidth,
        label,
        retour: true,
      };
    })
    .filter((a): a is AreteAffichee => a !== null);

  return [...aretesDirectes, ...aretesRetour];
}

export function VisualisationPanel({ societes, transactions }: Props) {
  const [date, setDate] = useState(today());
  const [echelle, setEchelle] = useState(1);
  const [echelleImpression, setEchelleImpression] = useState<number | null>(null);
  const conteneurRef = useRef<HTMLDivElement>(null);

  const organigramme = useMemo(
    () => calculerOrganigramme(societes, transactions, date),
    [societes, transactions, date],
  );

  const aretes = useMemo(() => calculerAretes(organigramme), [organigramme]);
  const groupeParCible = useMemo(() => new Map(organigramme.groupes.map((g) => [g.cibleId, g])), [organigramme]);

  // Met le graphe à l'échelle de la fenêtre : plus besoin de défiler
  // horizontalement pour une structure large, le texte reste lisible tant
  // que possible (jamais agrandi au-delà de sa taille naturelle).
  useEffect(() => {
    const conteneur = conteneurRef.current;
    if (!conteneur || organigramme.largeur === 0) return;

    function ajusterEchelle() {
      const largeurDisponible = conteneur!.clientWidth;
      setEchelle(Math.min(1, largeurDisponible / organigramme.largeur));
    }

    ajusterEchelle();
    const observer = new ResizeObserver(ajusterEchelle);
    observer.observe(conteneur);
    return () => observer.disconnect();
  }, [organigramme.largeur]);

  // Largeur imprimable d'une page A4 paysage (297 mm, marges de 12 mm de
  // chaque côté) convertie en pixels à 96 dpi : l'échelle "écran" (calculée
  // sur la largeur du panneau, pas de la page) ne convient pas à l'impression.
  useEffect(() => {
    const LARGEUR_A4_PAYSAGE_PX = 1032;
    function avantImpression() {
      setEchelleImpression(Math.min(1, LARGEUR_A4_PAYSAGE_PX / organigramme.largeur));
    }
    function apresImpression() {
      setEchelleImpression(null);
    }
    window.addEventListener("beforeprint", avantImpression);
    window.addEventListener("afterprint", apresImpression);
    return () => {
      window.removeEventListener("beforeprint", avantImpression);
      window.removeEventListener("afterprint", apresImpression);
    };
  }, [organigramme.largeur]);

  const echelleAffichee = echelleImpression ?? echelle;

  if (!societes.some((s) => s.principale)) {
    return (
      <section className="panel">
        <h2>Visualisation</h2>
        <p className="empty">
          Marquez au moins une société comme « Principale » (onglet Sociétés) pour qu'elle apparaisse dans
          l'organigramme.
        </p>
      </section>
    );
  }

  return (
    <section className="panel panel-viz">
      <div className="viz-head">
        <div>
          <h2>Visualisation</h2>
          <p className="lede">Structure actionnariale entre les sociétés principales, à une date donnée.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-small no-print" onClick={() => window.print()}>
          Exporter en PDF (A4)
        </button>
      </div>

      <div className="viz-filters no-print">
        <div className="form-field">
          <label htmlFor="viz-date">À la date du</label>
          <input id="viz-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <figure className="orgchart-figure">
        <div className="orgchart-scroll" ref={conteneurRef}>
          <div
            className="orgchart-viewport"
            style={{ width: "100%", height: organigramme.hauteur * echelleAffichee }}
          >
            <div
              className="orgchart-canvas"
              style={{
                width: organigramme.largeur,
                height: organigramme.hauteur,
                transform: `scale(${echelleAffichee})`,
              }}
            >
              <svg
                className="orgchart-svg"
                viewBox={`0 0 ${organigramme.largeur} ${organigramme.hauteur}`}
                width={organigramme.largeur}
                height={organigramme.hauteur}
                role="img"
                aria-label={`Liens de participation entre les sociétés au ${formatDate(date)}`}
              >
                <defs>
                  <marker
                    id="orgchart-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
                  </marker>
                </defs>
                {aretes.map((arete) => (
                  <g key={arete.cle}>
                    <path
                      d={arete.d}
                      className={`orgchart-edge-line ${arete.retour ? "orgchart-edge-line-retour" : ""}`}
                      fill="none"
                      markerEnd="url(#orgchart-arrow)"
                    />
                    <rect
                      x={arete.labelMx - arete.labelWidth / 2}
                      y={arete.labelY - 9}
                      width={arete.labelWidth}
                      height={17}
                      rx={3}
                      className="orgchart-edge-label-bg"
                    />
                    <text x={arete.labelMx} y={arete.labelY + 4} textAnchor="middle" className="orgchart-edge-label">
                      {arete.label}
                    </text>
                  </g>
                ))}
              </svg>
              {organigramme.noeuds.map((n) => {
                const groupe = groupeParCible.get(n.id);
                return (
                  <div key={n.id}>
                    <div className="orgchart-node" style={{ left: n.x, top: n.y, width: BOX_W, height: BOX_H }}>
                      <div className="orgchart-node-nom">{n.nom}</div>
                    </div>
                    {groupe && (
                      <div
                        className="orgchart-groupe"
                        style={{
                          left: n.x + BOX_W + GAP_GROUPE,
                          top: n.y + BOX_H / 2 - (groupe.entrees.length * LIGNE_GROUPE_H) / 2,
                          width: n.largeurGroupe,
                        }}
                      >
                        {groupe.entrees.map((e, i) => (
                          <div key={i} className="orgchart-groupe-ligne">
                            <span className="orgchart-groupe-pct">{formatNombre(e.pourcentage)}</span>
                            <span className="orgchart-groupe-nom">{e.nom}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <figcaption className="viz-base">
          Structure actionnariale au {formatDate(date)}. Chaque flèche va de la société actionnaire vers la
          société détenue (pourcentage cumulé jusqu'à cette date). Seules les sociétés « Principale » sont
          affichées comme boîtes ; les autres actionnaires apparaissent en liste à côté de la société qu'ils
          détiennent. Au-delà de 2 actionnaires principaux entrants, les suivants rejoignent aussi cette liste.
        </figcaption>
      </figure>
    </section>
  );
}
