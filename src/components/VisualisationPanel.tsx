import { useMemo, useState } from "react";
import type { Societe, Transaction } from "../types";
import { formatDate, formatMontant, formatPourcentage } from "../lib/format";
import { BOX_H, BOX_W, ROW_GAP, calculerOrganigramme } from "../lib/organigramme";
import { valorisationCourante } from "../lib/valorisation";

interface Props {
  societes: Societe[];
  transactions: Transaction[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function VisualisationPanel({ societes, transactions }: Props) {
  const [date, setDate] = useState(today());

  const organigramme = useMemo(
    () => calculerOrganigramme(societes, transactions, date),
    [societes, transactions, date],
  );

  if (societes.length === 0) {
    return (
      <section className="panel">
        <h2>Visualisation</h2>
        <p className="empty">Ajoutez des sociétés pour visualiser la structure actionnariale.</p>
      </section>
    );
  }

  const valorisationDe = (id: string) => {
    const societe = societes.find((s) => s.id === id);
    return societe ? valorisationCourante(societe, transactions, date).valeur : null;
  };

  return (
    <section className="panel">
      <h2>Visualisation</h2>
      <p className="lede">Structure actionnariale entre les sociétés, à une date donnée.</p>

      <div className="viz-filters">
        <div className="form-field">
          <label htmlFor="viz-date">À la date du</label>
          <input id="viz-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <figure className="orgchart-figure">
        <div className="orgchart-scroll">
          <div className="orgchart-canvas" style={{ width: organigramme.largeur, height: organigramme.hauteur }}>
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
              {organigramme.liens.map((lien) => {
                const parent = organigramme.noeuds.find((n) => n.id === lien.acheteurId);
                const enfant = organigramme.noeuds.find((n) => n.id === lien.cibleId);
                if (!parent || !enfant) return null;
                const x1 = parent.x + BOX_W / 2;
                const y1 = parent.y + BOX_H;
                const x2 = enfant.x + BOX_W / 2;
                const y2 = enfant.y;
                // Tracé en coude : le segment horizontal (et donc le label)
                // reste toujours dans la bande vide juste au-dessus de la
                // société détenue, jamais derrière une boîte intermédiaire.
                const gutterY = y2 - ROW_GAP / 2;
                const label = formatPourcentage(lien.pourcentage);
                const labelWidth = label.length * 6.6 + 8;
                return (
                  <g key={`${lien.acheteurId}::${lien.cibleId}`}>
                    <path
                      d={`M ${x1} ${y1} L ${x1} ${gutterY} L ${x2} ${gutterY} L ${x2} ${y2}`}
                      className="orgchart-edge-line"
                      fill="none"
                      markerEnd="url(#orgchart-arrow)"
                    />
                    <rect
                      x={(x1 + x2) / 2 - labelWidth / 2}
                      y={gutterY - 9}
                      width={labelWidth}
                      height={17}
                      rx={3}
                      className="orgchart-edge-label-bg"
                    />
                    <text x={(x1 + x2) / 2} y={gutterY + 4} textAnchor="middle" className="orgchart-edge-label">
                      {label}
                    </text>
                  </g>
                );
              })}
            </svg>
            {organigramme.noeuds.map((n) => (
              <div
                key={n.id}
                className="orgchart-node"
                style={{ left: n.x, top: n.y, width: BOX_W, height: BOX_H }}
              >
                <div className="orgchart-node-nom">{n.nom}</div>
                <div className="orgchart-node-valo">{formatMontant(valorisationDe(n.id))}</div>
              </div>
            ))}
          </div>
        </div>
        <figcaption className="viz-base">
          Structure actionnariale au {formatDate(date)}. Chaque flèche va de la société actionnaire vers la
          société détenue ; le pourcentage est repondéré à la valorisation actuelle de la société détenue.
        </figcaption>
      </figure>
    </section>
  );
}
