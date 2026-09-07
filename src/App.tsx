import { useEffect, useState } from "react";
import { ParticipationsTable } from "./components/ParticipationsTable";
import { SocieteForm } from "./components/SocieteForm";
import { SocietesTable } from "./components/SocietesTable";
import { TransactionForm } from "./components/TransactionForm";
import { TransactionsTable } from "./components/TransactionsTable";
import { VisualisationPanel } from "./components/VisualisationPanel";
import * as api from "./lib/api";
import type { Societe, Transaction } from "./types";

const ONGLETS = [
  { id: "societes", label: "Sociétés" },
  { id: "transactions", label: "Transactions" },
  { id: "participations", label: "Participations" },
  { id: "visualisation", label: "Visualisation" },
] as const;

type OngletId = (typeof ONGLETS)[number]["id"];

function messageErreur(e: unknown): string {
  return e instanceof Error ? e.message : "Une erreur est survenue.";
}

function App() {
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [onglet, setOnglet] = useState<OngletId>("societes");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.fetchSocietes(), api.fetchTransactions()])
      .then(([s, t]) => {
        setSocietes(s);
        setTransactions(t);
      })
      .catch((e) => setErreur(`Impossible de charger les données : ${messageErreur(e)}`))
      .finally(() => setChargement(false));
  }, []);

  async function ajouterSociete(societe: Omit<Societe, "id">) {
    try {
      const creee = await api.creerSociete(societe);
      setSocietes((prev) => [...prev, creee]);
      setErreur(null);
    } catch (e) {
      setErreur(`Impossible d'ajouter la société : ${messageErreur(e)}`);
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
      setErreur(`Impossible de supprimer la société : ${messageErreur(e)}`);
    }
  }

  async function ajouterTransaction(transaction: Omit<Transaction, "id">) {
    try {
      const creee = await api.creerTransaction(transaction);
      setTransactions((prev) => [...prev, creee]);
      setErreur(null);
    } catch (e) {
      setErreur(`Impossible d'ajouter la transaction : ${messageErreur(e)}`);
    }
  }

  async function supprimerTransaction(id: string) {
    try {
      await api.supprimerTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      setErreur(null);
    } catch (e) {
      setErreur(`Impossible de supprimer la transaction : ${messageErreur(e)}`);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Calcul des titres</h1>
        <p className="subtitle">
          Suivez les transactions d'actions entre vos sociétés et la structure actionnariale qui en découle.
        </p>
      </header>

      {erreur && (
        <p className="form-error" role="alert" style={{ textAlign: "center", marginBottom: 16 }}>
          {erreur}
        </p>
      )}

      <nav className="tabs">
        {ONGLETS.map((o) => (
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
        <main className="layout-single">
          {onglet === "societes" && (
            <section className="panel">
              <h2>Sociétés</h2>
              <SocietesTable societes={societes} transactions={transactions} onDelete={supprimerSociete} />
              <h3>Ajouter une société</h3>
              <SocieteForm onAdd={ajouterSociete} />
            </section>
          )}

          {onglet === "transactions" && (
            <section className="panel">
              <h2>Transactions</h2>
              <TransactionsTable
                transactions={transactions}
                societes={societes}
                onDelete={supprimerTransaction}
              />
              <h3>Ajouter une transaction</h3>
              <TransactionForm societes={societes} onAdd={ajouterTransaction} />
            </section>
          )}

          {onglet === "participations" && (
            <section className="panel">
              <h2>Participations</h2>
              <p className="subtitle-panel">Qui détient combien du capital de qui.</p>
              <ParticipationsTable societes={societes} transactions={transactions} />
            </section>
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
