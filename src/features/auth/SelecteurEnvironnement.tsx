import { ecrireEnvironnement, ENVIRONNEMENTS, type Environnement } from "../../api/environnement";

interface Props {
  onChoisi: (environnement: Environnement) => void;
}

const LIBELLES: Record<Environnement, string> = {
  TITRA_DEV: "Développement",
  TITRA_RECETTE: "Recette",
  TITRA_PROD: "Production",
};

/**
 * Écran affiché avant la connexion : choix de l'environnement (une base de
 * données par environnement, même serveur SQL — voir
 * Services/Environnements.cs côté serveur). Le choix est mémorisé (voir
 * api/environnement.ts) et envoyé dans l'en-tête X-Environnement à chaque
 * appel API, y compris le login lui-même (chaque environnement a ses
 * propres utilisateurs) — jamais redemandé tant qu'il n'est pas
 * explicitement changé (voir le lien "Changer d'environnement" une fois
 * connecté).
 */
export function SelecteurEnvironnement({ onChoisi }: Props) {
  function choisir(environnement: Environnement) {
    ecrireEnvironnement(environnement);
    onChoisi(environnement);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Calcul des titres</h1>
        <p className="subtitle">Choisissez l'environnement auquel vous souhaitez vous connecter.</p>
      </header>

      <div className="panel layout-single">
        <div className="environnement-liste">
          {ENVIRONNEMENTS.map((environnement) => (
            <button
              key={environnement}
              type="button"
              className="btn btn-primary environnement-bouton"
              onClick={() => choisir(environnement)}
            >
              {LIBELLES[environnement]}
              <span className="environnement-bouton-code">{environnement}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
