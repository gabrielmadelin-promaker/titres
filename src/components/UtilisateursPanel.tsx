import { useState } from "react";
import * as api from "../lib/api";
import type { Utilisateur } from "../lib/api";

const ROLES = ["DSI", "Direction des titres"] as const;

interface Props {
  utilisateurs: Utilisateur[];
  onAjoute: (utilisateur: Utilisateur) => void;
  onSupprime: (id: string) => void;
}

function formatCreeLe(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("fr-FR");
}

export function UtilisateursPanel({ utilisateurs, onAjoute, onSupprime }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>(ROLES[0]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [dernierCree, setDernierCree] = useState<Utilisateur | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailPropre = email.trim();
    if (!emailPropre) return;

    setEnCours(true);
    setErreur(null);
    try {
      const cree = await api.creerUtilisateur(emailPropre, role);
      onAjoute(cree);
      setDernierCree(cree);
      setEmail("");
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Impossible de créer l'utilisateur.");
    } finally {
      setEnCours(false);
    }
  }

  async function supprimer(id: string) {
    if (!window.confirm("Supprimer cet utilisateur ? Il ne pourra plus se connecter.")) return;
    try {
      await api.supprimerUtilisateur(id);
      onSupprime(id);
      setDernierCree((prev) => (prev?.id === id ? null : prev));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Impossible de supprimer l'utilisateur.");
    }
  }

  return (
    <section className="panel">
      <h2>Utilisateurs</h2>
      <p className="subtitle-panel">
        Authentification temporaire, en attendant le SSO : le mot de passe est généré automatiquement et reste
        affiché en clair ci-dessous — c'est à vous de le communiquer à la personne concernée.
      </p>

      <h3>Ajouter un utilisateur</h3>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="util-email">Email</label>
          <input
            id="util-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom.nom@bollore.com"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="util-role">Rôle</label>
          <select id="util-role" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {erreur && <p className="form-error">{erreur}</p>}

        <button type="submit" className="btn btn-primary" disabled={enCours}>
          {enCours ? "Création…" : "Ajouter l'utilisateur"}
        </button>
      </form>

      {dernierCree && (
        <p className="import-result">
          Utilisateur « {dernierCree.email} » créé — mot de passe : <strong>{dernierCree.motDePasse}</strong>{" "}
          (à communiquer vous-même ; toujours consultable depuis la liste ci-dessous).
        </p>
      )}

      <h3>Liste des utilisateurs</h3>
      {utilisateurs.length === 0 ? (
        <p className="empty">Aucun utilisateur pour le moment.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Rôle</th>
                <th>Mot de passe</th>
                <th>Créé le</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {utilisateurs.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{u.motDePasse}</td>
                  <td>{formatCreeLe(u.creeLe)}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-danger btn-small" onClick={() => supprimer(u.id)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
