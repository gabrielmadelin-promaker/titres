import { useState } from "react";
import { ParticipationsTable } from "./components/ParticipationsTable";
import { SocieteForm } from "./components/SocieteForm";
import { SocietesTable } from "./components/SocietesTable";
import { TransactionForm } from "./components/TransactionForm";
import { TransactionsTable } from "./components/TransactionsTable";
import { VisualisationPanel } from "./components/VisualisationPanel";
import { usePersistentState } from "./lib/storage";
import type { Societe, Transaction } from "./types";

function createId(): string {
  return crypto.randomUUID();
}

const ONGLETS = [
  { id: "societes", label: "Sociétés" },
  { id: "transactions", label: "Transactions" },
  { id: "participations", label: "Participations" },
  { id: "visualisation", label: "Visualisation" },
] as const;

type OngletId = (typeof ONGLETS)[number]["id"];

function App() {
  const [societes, setSocietes] = usePersistentState<Societe[]>("titres.societes", []);
  const [transactions, setTransactions] = usePersistentState<Transaction[]>(
    "titres.transactions",
    [],
  );
  const [onglet, setOnglet] = useState<OngletId>("societes");

  function ajouterSociete(societe: Omit<Societe, "id">) {
    setSocietes((prev) => [...prev, { ...societe, id: createId() }]);
  }

  function supprimerSociete(id: string) {
    const utilisee = transactions.some((t) => t.acheteurId === id || t.cibleId === id);
    if (
      utilisee &&
      !window.confirm(
        "Cette société est référencée par au moins une transaction. La supprimer quand même ?",
      )
    ) {
      return;
    }
    setSocietes((prev) => prev.filter((s) => s.id !== id));
  }

  function ajouterTransaction(transaction: Omit<Transaction, "id">) {
    setTransactions((prev) => [...prev, { ...transaction, id: createId() }]);
  }

  function supprimerTransaction(id: string) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Calcul des titres</h1>
        <p className="subtitle">
          Suivez les transactions d'actions entre vos sociétés et la structure actionnariale qui en découle.
        </p>
      </header>

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
    </div>
  );
}

export default App;
