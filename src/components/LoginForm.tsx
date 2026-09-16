import { useState } from "react";
import * as api from "../lib/api";
import type { UtilisateurConnecte } from "../lib/api";
import { ecrireToken } from "../lib/auth";

interface Props {
  onConnecte: (utilisateur: UtilisateurConnecte) => void;
}

export function LoginForm({ onConnecte }: Props) {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await api.connecter(email.trim(), motDePasse);
      ecrireToken(reponse.token);
      onConnecte({ email: reponse.email, role: reponse.role });
    } catch (err) {
      // Un 401 sans corps (mauvais mot de passe) tombe dans le message
      // générique "Erreur 401 sur /auth/login" — pas assez clair pour un
      // formulaire de connexion, on le remplace par un message dédié.
      const message = err instanceof Error ? err.message : "";
      setErreur(message && !message.startsWith("Erreur ") ? message : "Email ou mot de passe incorrect.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Calcul des titres</h1>
        <p className="subtitle">Connectez-vous pour accéder à l'application.</p>
      </header>

      <div className="panel layout-single">
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="login-mot-de-passe">Mot de passe</label>
            <input
              id="login-mot-de-passe"
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {erreur && <p className="form-error">{erreur}</p>}

          <button type="submit" className="btn btn-primary" disabled={enCours}>
            {enCours ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
