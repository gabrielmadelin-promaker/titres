import { useEffect, useMemo, useRef, useState } from "react";
import type { Societe, Transaction } from "../types";
import { formatDate, formatNombre } from "../lib/format";
import { BOX_H, BOX_W, GAP_GROUPE, LIGNE_GROUPE_H, calculerOrganigramme } from "../lib/organigramme";
import { calculerAretes } from "../lib/aretes";

interface Props {
  societes: Societe[];
  transactions: Transaction[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function VisualisationPanel({ societes, transactions }: Props) {
  const [date, setDate] = useState(today());
  const [echelle, setEchelle] = useState(1);
  const [echelleImpression, setEchelleImpression] = useState<number | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);
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

  async function exporterPptx() {
    setExportEnCours(true);
    try {
      const { exporterOrganigrammePptx } = await import("../lib/pptxExport");
      await exporterOrganigrammePptx(organigramme, aretes, date);
    } catch (erreur) {
      console.error("Échec de l'export PowerPoint", erreur);
      window.alert("L'export PowerPoint a échoué. Réessayez.");
    } finally {
      setExportEnCours(false);
    }
  }

  if (societes.length === 0) {
    return (
      <section className="panel">
        <h2>Visualisation</h2>
        <p className="empty">Ajoutez des sociétés pour visualiser la structure actionnariale.</p>
      </section>
    );
  }

  return (
    <section className="panel panel-viz">
      <div className="viz-head">
        <div>
          <h2>Visualisation</h2>
          <p className="lede">Structure actionnariale entre les sociétés, à une date donnée.</p>
        </div>
        <div className="viz-actions no-print">
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={exporterPptx}
            disabled={exportEnCours}
          >
            {exportEnCours ? "Génération…" : "Télécharger en PowerPoint"}
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => window.print()}>
            Exporter en PDF (A4)
          </button>
        </div>
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
          société détenue (pourcentage cumulé jusqu'à cette date). Pour une société marquée « Principale », au-delà
          de 2 actionnaires entrants, les suivants (par % décroissant) rejoignent une liste compacte à côté de la
          boîte plutôt que d'ajouter une flèche.
        </figcaption>
      </figure>
    </section>
  );
}
