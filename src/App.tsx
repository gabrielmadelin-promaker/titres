import { useEffect, useState } from "react";
import { ComptesPanel } from "./components/ComptesPanel";
import { ImportSocietes } from "./components/ImportSocietes";
import { ImportTransactions } from "./components/ImportTransactions";
import { LoginForm } from "./components/LoginForm";
import { Modal } from "./components/Modal";
import { ParticipationsTable } from "./components/ParticipationsTable";
import { SocieteForm } from "./components/SocieteForm";
import { SocietesTable } from "./components/SocietesTable";
import { TransactionForm } from "./components/TransactionForm";
import { TransactionsTable } from "./components/TransactionsTable";
import { TitresPanel } from "./components/TitresPanel";
import { TypesPanel } from "./components/TypesPanel";
import { UtilisateursPanel } from "./components/UtilisateursPanel";
import * as api from "./lib/api";
import type { Utilisateur, UtilisateurConnecte } from "./lib/api";
import { effacerToken, lireToken, SessionExpireeError } from "./lib/auth";
import type { Compte, HistoriqueTotalSociete, Societe, Titre, Transaction, TypeTitre } from "./types";

const ONGLETS = [
  { id: "societes", label: "Sociétés" },
  { id: "transactions", label: "Transactions" },
  { id: "categories", label: "Catégories" },
  { id: "comptes", label: "Comptes" },
  { id: "participations", label: "Participations" },
  { id: "titres", label: "Titres" },
  { id: "utilisateurs", label: "Utilisateurs" },
] as const;

type OngletId = (typeof ONGLETS)[number]["id"];

function messageErreur(e: unknown): string {
  return e instanceof Error ? e.message : "Une erreur est survenue.";
}

function App() {
  const [utilisateurConnecte, setUtilisateurConnecte] = useState<UtilisateurConnecte | null>(null);
  const [verificationSession, setVerificationSession] = useState(true);

  const [societes, setSocietes] = useState<Societe[]>([]);
  const [historiqueTotaux, setHistoriqueTotaux] = useState<HistoriqueTotalSociete[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [actions, setActions] = useState<Titre[]>([]);
  const [types, setTypes] = useState<TypeTitre[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [onglet, setOnglet] = useState<OngletId>("societes");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [modaleSocieteOuverte, setModaleSocieteOuverte] = useState(false);
  const [modaleTransactionOuverte, setModaleTransactionOuverte] = useState(false);

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
    // La liste des utilisateurs (avec mots de passe en clair) n'est chargée
    // que pour le rôle DSI, seul à voir cet écran — pas la peine de faire
    // transiter ces données jusqu'au navigateur d'un autre rôle, même si
    // l'écran qui les affiche ne serait de toute façon pas rendu.
    const estDsi = utilisateurConnecte.role === "DSI";
    Promise.all([
      api.fetchSocietes(),
      api.fetchHistoriqueTotaux(),
      api.fetchTransactions(),
      api.fetchActions(),
      api.fetchTypes(),
      api.fetchComptes(),
      estDsi ? api.fetchUtilisateurs() : Promise.resolve([]),
    ])
      .then(([s, ht, t, a, ty, c, u]) => {
        setSocietes(s);
        setHistoriqueTotaux(ht);
        setTransactions(t);
        setActions(a);
        setTypes(ty);
        setComptes(c);
        setUtilisateurs(u);
      })
      .catch((e) => gererErreur(e, "Impossible de charger les données"))
      .finally(() => setChargement(false));
  }, [utilisateurConnecte]);

  // La table des lots d'Actions est régénérée côté serveur à chaque
  // création/modification/suppression de transaction : impossible de la
  // mettre à jour de façon optimiste côté client (la logique de synchro
  // n'est pas dupliquée ici), on la recharge donc après coup.
  async function rechargerTitres() {
    try {
      setActions(await api.fetchActions());
    } catch (e) {
      gererErreur(e, "Impossible de recharger les titres");
    }
  }

  async function seDeconnecter() {
    try {
      await api.deconnecter();
    } catch {
      // Sans conséquence si la requête échoue (session déjà expirée, réseau
      // coupé...) : le jeton local est effacé de toute façon.
    }
    seDeconnecterLocal();
  }

  // Renvoie l'id créé (ou null en cas d'échec) plutôt qu'un simple booléen :
  // nécessaire au formulaire d'ajout pour pouvoir, dans le même geste,
  // créer une première ligne de totaux (HistoriqueTotalSociete) rattachée
  // à cette société si l'utilisateur en a renseigné.
  async function ajouterSociete(societe: Omit<Societe, "id">) {
    try {
      const creee = await api.creerSociete(societe);
      setSocietes((prev) => [...prev, creee]);
      setErreur(null);
      return creee.id;
    } catch (e) {
      gererErreur(e, "Impossible d'ajouter la société");
      return null;
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

  async function ajouterHistoriqueTotal(ligne: Omit<HistoriqueTotalSociete, "id">) {
    try {
      const creee = await api.creerHistoriqueTotal(ligne);
      setHistoriqueTotaux((prev) => [...prev, creee]);
      setErreur(null);
      return true;
    } catch (e) {
      gererErreur(e, "Impossible d'ajouter cette ligne d'historique");
      return false;
    }
  }

  async function modifierHistoriqueTotal(id: string, champs: Omit<HistoriqueTotalSociete, "id">) {
    const avant = historiqueTotaux;
    setHistoriqueTotaux((prev) => prev.map((h) => (h.id === id ? { ...h, ...champs } : h)));
    try {
      await api.modifierHistoriqueTotal(id, champs);
      setErreur(null);
    } catch (e) {
      setHistoriqueTotaux(avant);
      gererErreur(e, "Impossible de modifier cette ligne d'historique");
    }
  }

  async function supprimerHistoriqueTotal(id: string) {
    if (!window.confirm("Supprimer cette ligne d'historique ?")) return;
    try {
      await api.supprimerHistoriqueTotal(id);
      setHistoriqueTotaux((prev) => prev.filter((h) => h.id !== id));
      setErreur(null);
    } catch (e) {
      gererErreur(e, "Impossible de supprimer cette ligne d'historique");
    }
  }

  async function ajouterType(nom: string) {
    try {
      const cree = await api.creerType(nom);
      setTypes((prev) => [...prev, cree]);
      setErreur(null);
      return true;
    } catch (e) {
      gererErreur(e, "Impossible d'ajouter ce type");
      return false;
    }
  }

  async function supprimerType(id: string) {
    if (!window.confirm("Supprimer ce type ?")) return;
    try {
      await api.supprimerType(id);
      setTypes((prev) => prev.filter((t) => t.id !== id));
      setErreur(null);
    } catch (e) {
      gererErreur(e, "Impossible de supprimer ce type");
    }
  }

  async function modifierCompte(id: string, champs: Omit<Compte, "id">) {
    const avant = comptes;
    setComptes((prev) => prev.map((c) => (c.id === id ? { ...c, ...champs } : c)));
    try {
      await api.modifierCompte(id, champs);
      setErreur(null);
    } catch (e) {
      setComptes(avant);
      gererErreur(e, "Impossible de modifier ce compte");
    }
  }

  async function supprimerCompte(id: string) {
    if (!window.confirm("Supprimer ce compte ?")) return;
    try {
      await api.supprimerCompte(id);
      setComptes((prev) => prev.filter((c) => c.id !== id));
      setErreur(null);
    } catch (e) {
      gererErreur(e, "Impossible de supprimer ce compte");
    }
  }

  async function supprimerSociete(id: string) {
    const utilisee = transactions.some(
      (t) => t.acheteurId === id || t.cibleId === id || t.vendeurId === id,
    );
    const message = utilisee
      ? "Cette société est référencée par au moins une transaction (comme acheteuse, cible ou vendeuse). Les transactions concernées resteront, mais afficheront une société supprimée. La supprimer quand même ?"
      : "Supprimer cette société ?";
    if (!window.confirm(message)) return;
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
      await rechargerTitres();
      return true;
    } catch (e) {
      gererErreur(e, "Impossible d'ajouter la transaction");
      return false;
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
      await rechargerTitres();
    } catch (e) {
      setTransactions(avant);
      gererErreur(e, "Impossible de modifier la transaction");
    }
  }

  async function supprimerTransaction(id: string) {
    if (!window.confirm("Supprimer cette transaction ? Les calculs de participations en tiendront compte immédiatement.")) return;
    try {
      await api.supprimerTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      setErreur(null);
      await rechargerTitres();
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
    if (creees.length > 0) {
      setTransactions((prev) => [...prev, ...creees]);
      await rechargerTitres();
    }
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

  // Seul le rôle DSI voit et accède à l'écran de gestion des utilisateurs
  // (seule restriction de rôle pour l'instant, sur demande explicite).
  const estDsi = utilisateurConnecte.role === "DSI";

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
        {ONGLETS.filter((o) => o.id !== "utilisateurs" || estDsi).map((o) => (
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
              <div className="table-toolbar">
                <button type="button" className="btn btn-primary" onClick={() => setModaleSocieteOuverte(true)}>
                  + Ajouter une société
                </button>
                <ImportSocietes societes={societes} onImport={importerSocietes} />
              </div>
              <Modal title="Ajouter une société" open={modaleSocieteOuverte} onClose={() => setModaleSocieteOuverte(false)}>
                <SocieteForm
                  onAdd={ajouterSociete}
                  onAddHistoriqueTotal={ajouterHistoriqueTotal}
                  types={types}
                  onSuccess={() => setModaleSocieteOuverte(false)}
                />
              </Modal>
              <h3>Liste des sociétés</h3>
              <SocietesTable
                societes={societes}
                historiqueTotaux={historiqueTotaux}
                transactions={transactions}
                types={types}
                onDelete={supprimerSociete}
                onUpdate={modifierSociete}
                onAddHistoriqueTotal={ajouterHistoriqueTotal}
                onUpdateHistoriqueTotal={modifierHistoriqueTotal}
                onDeleteHistoriqueTotal={supprimerHistoriqueTotal}
              />
            </section>
          )}

          {onglet === "transactions" && (
            <section className="panel">
              <h2>Transactions</h2>
              <div className="table-toolbar">
                <button type="button" className="btn btn-primary" onClick={() => setModaleTransactionOuverte(true)}>
                  + Ajouter une transaction
                </button>
                <ImportTransactions societes={societes} onImport={importerTransactions} />
              </div>
              <Modal
                title="Ajouter une transaction"
                open={modaleTransactionOuverte}
                onClose={() => setModaleTransactionOuverte(false)}
              >
                <TransactionForm
                  societes={societes}
                  types={types}
                  comptes={comptes}
                  onAdd={ajouterTransaction}
                  onSuccess={() => setModaleTransactionOuverte(false)}
                />
              </Modal>
              <h3>Liste des transactions</h3>
              <TransactionsTable
                transactions={transactions}
                societes={societes}
                historiqueTotaux={historiqueTotaux}
                types={types}
                comptes={comptes}
                onDelete={supprimerTransaction}
                onUpdate={modifierTransaction}
              />
            </section>
          )}

          {onglet === "categories" && (
            <section className="panel">
              <h2>Catégories</h2>
              <p className="subtitle-panel">
                Catégories de titres (ex. Action ordinaire, Action de préférence...), utilisées en suggestions sur les
                champs Catégorie des transactions et des totaux de société.
              </p>
              <TypesPanel types={types} onAdd={ajouterType} onDelete={supprimerType} />
            </section>
          )}

          {onglet === "comptes" && (
            <section className="panel">
              <h2>Comptes</h2>
              <p className="subtitle-panel">
                Regroupement nommé des titres détenus par un actionnaire, dédié à une seule Société émettrice et une
                seule Catégorie. Jamais créés à la main : trouvés ou créés automatiquement à la saisie d'une
                transaction ou des totaux d'une société. Renommables ou supprimables ici.
              </p>
              <ComptesPanel
                societes={societes}
                comptes={comptes}
                types={types}
                onUpdate={modifierCompte}
                onDelete={supprimerCompte}
              />
            </section>
          )}

          {onglet === "participations" && (
            <section className="panel">
              <h2>Participations</h2>
              <p className="subtitle-panel">Qui détient combien du capital de qui.</p>
              <ParticipationsTable societes={societes} historiqueTotaux={historiqueTotaux} transactions={transactions} />
            </section>
          )}

          {onglet === "titres" && (
            <section className="panel">
              <h2>Titres</h2>
              <p className="subtitle-panel">
                Lots de titres — qui détient combien, de quelle catégorie, à quel prix. Généré automatiquement à
                partir des transactions : lecture seule.
              </p>
              <TitresPanel societes={societes} actions={actions} comptes={comptes} />
            </section>
          )}

          {onglet === "utilisateurs" && estDsi && (
            <UtilisateursPanel
              utilisateurs={utilisateurs}
              onAjoute={(u) => setUtilisateurs((prev) => [...prev, u])}
              onSupprime={(id) => setUtilisateurs((prev) => prev.filter((u) => u.id !== id))}
            />
          )}
        </main>
      )}
    </div>
  );
}

export default App;
