import { useEffect, useState } from "react";
import { ImportSocietes } from "./components/ImportSocietes";
import { ImportTransactions } from "./components/ImportTransactions";
import { LoginForm } from "./components/LoginForm";
import { ParticipationsTable } from "./components/ParticipationsTable";
import { SocieteForm } from "./components/SocieteForm";
import { SocietesTable } from "./components/SocietesTable";
import { TransactionForm } from "./components/TransactionForm";
import { TransactionsTable } from "./components/TransactionsTable";
import { UtilisateursPanel } from "./components/UtilisateursPanel";
import { VisualisationPanel } from "./components/VisualisationPanel";
import * as api from "./lib/api";
import type { Utilisateur, UtilisateurConnecte } from "./lib/api";
import { effacerToken, lireToken, SessionExpireeError } from "./lib/auth";
import type { Societe, Transaction } from "./types";

const ONGLETS = [
  { id: "societes", label: "Sociétés" },
  { id: "transactions", label: "Transactions" },
  { id: "participations", label: "Participations" },
  { id: "utilisateurs", label: "Utilisateurs" },
  // Onglet retiré de la navigation (demande explicite) mais le code
  // (VisualisationPanel, organigramme.ts, aretes.ts) reste en place pour le
  // réactiver facilement plus tard : il suffit de retirer `masque: true`.
  { id: "visualisation", label: "Visualisation", masque: true },
] as const;

type OngletId = (typeof ONGLETS)[number]["id"];

function messageErreur(e: unknown): string {
  return e instanceof Error ? e.message : "Une erreur est survenue.";
}

function App() {
  const [utilisateurConnecte, setUtilisateurConnecte] = useState<UtilisateurConnecte | null>(null);
  const [verificationSession, setVerificationSession] = useState(true);

  const [societes, setSocietes] = useState<Societe[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [onglet, setOnglet] = useState<OngletId>("societes");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  function seDeconnecterLocal() {
    effacerToken();
    setUtilisateurConnecte(null);
  }

  // Centralise la réaction à une session expirée/invalide : partout ailleurs
  // dans ce composant, un catch(e) passe par ici plutôt que par un simple
  // setErreur, pour ramener l'utilisateur à l'écran de connexion au lieu de
  // simplement afficher un message d'erreur qu'il ne peut pas résoudre.
  function gererErreur(e: unknown, prefixe: string) {
    if (e instanceof SessionExpireeError) {
      seDeconnecterLocal();
      return;
    }
    setErreur(`${prefixe} : ${messageErreur(e)}`);
  }

  useEffect(() => {
    const token = lireToken();
    if (!token) {
      setVerificationSession(false);
      return;
    }
    api
      .verifierSession()
      .then((u) => setUtilisateurConnecte(u))
      .catch(() => effacerToken())
      .finally(() => setVerificationSession(false));
  }, []);

  useEffect(() => {
    if (!utilisateurConnecte) return;
    setChargement(true);
    Promise.all([api.fetchSocietes(), api.fetchTransactions(), api.fetchUtilisateurs()])
      .then(([s, t, u]) => {
        setSocietes(s);
        setTransactions(t);
        setUtilisateurs(u);
      })
      .catch((e) => gererErreur(e, "Impossible de charger les données"))
      .finally(() => setChargement(false));
  }, [utilisateurConnecte]);

  async function seDeconnecter() {
    try {
      await api.deconnecter();
    } catch {
      // Sans conséquence si la requête échoue (session déjà expirée, réseau
      // coupé...) : le jeton local est effacé de toute façon.
    }
    seDeconnecterLocal();
  }

  async function ajouterSociete(societe: Omit<Societe, "id">) {
    try {
      const creee = await api.creerSociete(societe);
      setSocietes((prev) => [...prev, creee]);
      setErreur(null);
    } catch (e) {
      gererErreur(e, "Impossible d'ajouter la société");
    }
  }

  async function modifierSociete(id: string, champs: Omit<Societe, "id">) {
    const avant = societes;
    // Optimiste : la table doit réagir immédiatement à l'enregistrement.
    setSocietes((prev) => prev.map((s) => (s.id === id ? { ...s, ...champs } : s)));
    try {
      await api.modifierSociete(id, champs);
      setErreur(null);
    } catch (e) {
      setSocietes(avant);
      gererErreur(e, "Impossible de modifier la société");
    }
  }

  async function supprimerSociete(id: string) {
    const utilisee = transactions.some((t) => t.acheteurId === id || t.cibleId === id);
    if (
      utilisee &&
      !window.confirm(
        "Cette société est référencée par au moins une transaction. La supprimer quand même ?",
      )
    ) {
      return;
    }
    try {
      await api.supprimerSociete(id);
      setSocietes((prev) => prev.filter((s) => s.id !== id));
      setErreur(null);
    } catch (e) {
      gererErreur(e, "Impossible de supprimer la société");
    }
  }

  async function ajouterTransaction(transaction: Omit<Transaction, "id">) {
    try {
      const creee = await api.creerTransaction(transaction);
      setTransactions((prev) => [...prev, creee]);
      setErreur(null);
    } catch (e) {
      gererErreur(e, "Impossible d'ajouter la transaction");
    }
  }

  async function modifierTransaction(id: string, champs: Omit<Transaction, "id">) {
    const avant = transactions;
    // Optimiste : la table doit réagir immédiatement à l'enregistrement.
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...champs } : t)));
    try {
      // La réponse du serveur fait autorité pour plusValue : calculée côté
      // API, sa vraie valeur n'est connue qu'une fois la requête traitée.
      const misAJour = await api.modifierTransaction(id, champs);
      setTransactions((prev) => prev.map((t) => (t.id === id ? misAJour : t)));
      setErreur(null);
    } catch (e) {
      setTransactions(avant);
      gererErreur(e, "Impossible de modifier la transaction");
    }
  }

  async function supprimerTransaction(id: string) {
    try {
      await api.supprimerTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      setErreur(null);
    } catch (e) {
      gererErreur(e, "Impossible de supprimer la transaction");
    }
  }

  async function importerSocietes(candidats: Omit<Societe, "id">[]) {
    const creees: Societe[] = [];
    const erreursImport: string[] = [];
    for (const candidat of candidats) {
      try {
        creees.push(await api.creerSociete(candidat));
      } catch (e) {
        if (e instanceof SessionExpireeError) {
          seDeconnecterLocal();
          break;
        }
        erreursImport.push(`« ${candidat.nom} » : ${messageErreur(e)}`);
      }
    }
    if (creees.length > 0) setSocietes((prev) => [...prev, ...creees]);
    return { ajoutees: creees.length, erreurs: erreursImport };
  }

  async function importerTransactions(candidates: Omit<Transaction, "id">[]) {
    const creees: Transaction[] = [];
    const erreursImport: string[] = [];
    for (const candidate of candidates) {
      try {
        creees.push(await api.creerTransaction(candidate));
      } catch (e) {
        if (e instanceof SessionExpireeError) {
          seDeconnecterLocal();
          break;
        }
        erreursImport.push(messageErreur(e));
      }
    }
    if (creees.length > 0) setTransactions((prev) => [...prev, ...creees]);
    return { ajoutees: creees.length, erreurs: erreursImport };
  }

  if (verificationSession) {
    return (
      <div className="app">
        <p className="empty" style={{ textAlign: "center" }}>
          Chargement…
        </p>
      </div>
    );
  }

  if (!utilisateurConnecte) {
    return <LoginForm onConnecte={setUtilisateurConnecte} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Calcul des titres</h1>
        <p className="subtitle">
          Suivez les transactions d'actions entre vos sociétés et la structure actionnariale qui en découle.
        </p>
        <div className="table-toolbar" style={{ justifyContent: "center", gap: 12, marginTop: 12 }}>
          <span className="subtitle-panel">
            Connecté : {utilisateurConnecte.email} · {utilisateurConnecte.role}
          </span>
          <button type="button" className="btn btn-secondary btn-small" onClick={seDeconnecter}>
            Se déconnecter
          </button>
        </div>
      </header>

      {erreur && (
        <p className="form-error" role="alert" style={{ textAlign: "center", marginBottom: 16 }}>
          {erreur}
        </p>
      )}

      <nav className="tabs">
        {ONGLETS.filter((o) => !("masque" in o && o.masque)).map((o) => (
          <button
            key={o.id}
            type="button"
            className={`tab ${onglet === o.id ? "tab-active" : ""}`}
            onClick={() => setOnglet(o.id)}
          >
            {o.label}
          </button>
        ))}
      </nav>

      {chargement ? (
        <p className="empty" style={{ textAlign: "center" }}>
          Chargement des données…
        </p>
      ) : (
        <main className="layout-wide">
          {onglet === "societes" && (
            <section className="panel">
              <h2>Sociétés</h2>
              <h3>Ajouter une société</h3>
              <SocieteForm onAdd={ajouterSociete} />
              <ImportSocietes societes={societes} onImport={importerSocietes} />
              <h3>Liste des sociétés</h3>
              <SocietesTable
                societes={societes}
                transactions={transactions}
                onDelete={supprimerSociete}
                onUpdate={modifierSociete}
              />
            </section>
          )}

          {onglet === "transactions" && (
            <section className="panel">
              <h2>Transactions</h2>
              <h3>Ajouter une transaction</h3>
              <TransactionForm societes={societes} onAdd={ajouterTransaction} />
              <ImportTransactions societes={societes} onImport={importerTransactions} />
              <h3>Liste des transactions</h3>
              <TransactionsTable
                transactions={transactions}
                societes={societes}
                onDelete={supprimerTransaction}
                onUpdate={modifierTransaction}
              />
            </section>
          )}

          {onglet === "participations" && (
            <section className="panel">
              <h2>Participations</h2>
              <p className="subtitle-panel">Qui détient combien du capital de qui.</p>
              <ParticipationsTable societes={societes} transactions={transactions} />
            </section>
          )}

          {onglet === "utilisateurs" && (
            <UtilisateursPanel
              utilisateurs={utilisateurs}
              onAjoute={(u) => setUtilisateurs((prev) => [...prev, u])}
              onSupprime={(id) => setUtilisateurs((prev) => prev.filter((u) => u.id !== id))}
            />
          )}

          {onglet === "visualisation" && (
            <VisualisationPanel societes={societes} transactions={transactions} />
          )}
        </main>
      )}
    </div>
  );
}

export default App;
