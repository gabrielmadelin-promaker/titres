import { useMemo, useState } from "react";
import type { Societe, Transaction } from "../types";
import { formatDate, formatMontant, formatPourcentage } from "../lib/format";
import { calculerParticipations } from "../lib/participations";
import { valorisationCourante } from "../lib/valorisation";

interface Props {
  societes: Societe[];
  transactions: Transaction[];
}

const NB_COULEURS = 8;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function VisualisationPanel({ societes, transactions }: Props) {
  const societesAvecTransactions = useMemo(
    () =>
      societes
        .filter((s) => transactions.some((t) => t.cibleId === s.id))
        .sort((a, b) => a.nom.localeCompare(b.nom)),
    [societes, transactions],
  );

  const [societeId, setSocieteId] = useState(societesAvecTransactions[0]?.id ?? "");
  const [date, setDate] = useState(today());

  const societeIdEffectif = societesAvecTransactions.some((s) => s.id === societeId)
    ? societeId
    : (societesAvecTransactions[0]?.id ?? "");
  const societe = societes.find((s) => s.id === societeIdEffectif) ?? null;

  const nomDe = (id: string) => societes.find((s) => s.id === id)?.nom ?? "(supprimée)";

  // Couleur stable par actionnaire (ordre alphabétique des acheteurs ayant
  // déjà investi dans cette société), indépendante de la date sélectionnée :
  // changer de date ne doit jamais réattribuer une couleur à un autre acteur.
  const slotParActionnaire = useMemo(() => {
    const map = new Map<string, number>();
    if (!societe) return map;
    const acheteurIds = [...new Set(transactions.filter((t) => t.cibleId === societe.id).map((t) => t.acheteurId))];
    const nomParId = (id: string) => societes.find((s) => s.id === id)?.nom ?? "";
    acheteurIds.sort((a, b) => nomParId(a).localeCompare(nomParId(b)));
    acheteurIds.forEach((id, i) => map.set(id, i < NB_COULEURS ? i + 1 : 0));
    return map;
  }, [societe, transactions, societes]);

  if (societesAvecTransactions.length === 0) {
    return (
      <section className="panel">
        <h2>Visualisation</h2>
        <p className="empty">
          Ajoutez des transactions pour visualiser la répartition du capital d'une société.
        </p>
      </section>
    );
  }

  const valorisationBase = societe
    ? valorisationCourante(societe, transactions, date)
    : { valeur: null, date: null, source: "aucune" as const };

  const parts = societe
    ? calculerParticipations(transactions, societes, date)
        .filter((p) => p.cibleId === societe.id)
        .sort((a, b) => (slotParActionnaire.get(a.acheteurId) ?? 99) - (slotParActionnaire.get(b.acheteurId) ?? 99))
    : [];

  const principaux = parts.filter((p) => (slotParActionnaire.get(p.acheteurId) ?? 0) > 0);
  const autresPourcentage = parts
    .filter((p) => (slotParActionnaire.get(p.acheteurId) ?? 0) === 0)
    .reduce((s, p) => s + p.pourcentageTotal, 0);

  const total = principaux.reduce((s, p) => s + p.pourcentageTotal, 0) + autresPourcentage;
  const depassement = total > 100.001;
  const nonAttribue = depassement ? 0 : Math.max(0, 100 - total);
  const baseLargeur = depassement ? total : 100;

  const montantDe = (pourcentage: number) =>
    valorisationBase.valeur !== null ? (pourcentage / 100) * valorisationBase.valeur : null;

  return (
    <section className="panel">
      <h2>Visualisation</h2>
      <p className="lede">Répartition du capital d'une société à une date donnée.</p>

      <div className="viz-filters">
        <div className="form-field">
          <label htmlFor="viz-societe">Société</label>
          <select id="viz-societe" value={societeIdEffectif} onChange={(e) => setSocieteId(e.target.value)}>
            {societesAvecTransactions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="viz-date">À la date du</label>
          <input id="viz-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {parts.length === 0 ? (
        <p className="empty">{(societe?.nom ?? "Cette société") + " n'a aucune transaction connue avant cette date."}</p>
      ) : (
        <>
          <div className="viz-bar-track">
            {principaux.map((p) => (
              <div
                key={p.acheteurId}
                className={`viz-segment series-${slotParActionnaire.get(p.acheteurId) ?? 0}`}
                style={{ flexBasis: `${(p.pourcentageTotal / baseLargeur) * 100}%` }}
                tabIndex={0}
                role="img"
                aria-label={`${nomDe(p.acheteurId)} : ${formatPourcentage(p.pourcentageTotal)}`}
              >
                <div className="viz-tooltip">
                  <strong>{formatPourcentage(p.pourcentageTotal)}</strong>
                  <span>{nomDe(p.acheteurId)}</span>
                </div>
              </div>
            ))}
            {autresPourcentage > 0.001 && (
              <div
                className="viz-segment series-0"
                style={{ flexBasis: `${(autresPourcentage / baseLargeur) * 100}%` }}
                tabIndex={0}
                role="img"
                aria-label={`Autres actionnaires : ${formatPourcentage(autresPourcentage)}`}
              >
                <div className="viz-tooltip">
                  <strong>{formatPourcentage(autresPourcentage)}</strong>
                  <span>Autres actionnaires</span>
                </div>
              </div>
            )}
            {!depassement && nonAttribue > 0.001 && (
              <div
                className="viz-segment series-none"
                style={{ flexBasis: `${nonAttribue}%` }}
                tabIndex={0}
                role="img"
                aria-label={`Non attribué : ${formatPourcentage(nonAttribue)}`}
              >
                <div className="viz-tooltip">
                  <strong>{formatPourcentage(nonAttribue)}</strong>
                  <span>Non attribué</span>
                </div>
              </div>
            )}
          </div>

          {depassement && (
            <p className="form-error">
              Le total des participations dépasse 100&nbsp;% à cette date ({formatPourcentage(total)}) : vérifiez
              les transactions. Barres affichées proportionnellement.
            </p>
          )}

          <ul className="viz-legend">
            {principaux.map((p) => (
              <li key={p.acheteurId}>
                <span className={`viz-swatch series-${slotParActionnaire.get(p.acheteurId) ?? 0}`} />
                <span className="viz-legend-name">{nomDe(p.acheteurId)}</span>
                <span className="viz-legend-pct">{formatPourcentage(p.pourcentageTotal)}</span>
                <span className="viz-legend-montant">{formatMontant(montantDe(p.pourcentageTotal))}</span>
              </li>
            ))}
            {autresPourcentage > 0.001 && (
              <li>
                <span className="viz-swatch series-0" />
                <span className="viz-legend-name">Autres actionnaires</span>
                <span className="viz-legend-pct">{formatPourcentage(autresPourcentage)}</span>
                <span className="viz-legend-montant">{formatMontant(montantDe(autresPourcentage))}</span>
              </li>
            )}
            {!depassement && nonAttribue > 0.001 && (
              <li>
                <span className="viz-swatch series-none" />
                <span className="viz-legend-name">Non attribué</span>
                <span className="viz-legend-pct">{formatPourcentage(nonAttribue)}</span>
                <span className="viz-legend-montant">{formatMontant(montantDe(nonAttribue))}</span>
              </li>
            )}
          </ul>

          <p className="viz-base">
            Base : valorisation {formatMontant(valorisationBase.valeur)}
            {valorisationBase.date ? ` au ${formatDate(valorisationBase.date)}` : ""}.
          </p>
        </>
      )}
    </section>
  );
}
