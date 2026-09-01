import { SocieteForm } from "./components/SocieteForm";
import { SocietesTable } from "./components/SocietesTable";
import { TransactionForm } from "./components/TransactionForm";
import { TransactionsTable } from "./components/TransactionsTable";
import { usePersistentState } from "./lib/storage";
import type { Societe, Transaction } from "./types";

function createId(): string {
  return crypto.randomUUID();
}

function App() {
  const [societes, setSocietes] = usePersistentState<Societe[]>("titres.societes", []);
  const [transactions, setTransactions] = usePersistentState<Transaction[]>(
    "titres.transactions",
    [],
  );

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

  function changerValorisation(id: string, valeur: number) {
    const aujourdHui = new Date().toISOString().slice(0, 10);
    setSocietes((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, valorisationInitiale: valeur, valorisationInitialeDate: aujourdHui }
          : s,
      ),
    );
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
          Suivez la valorisation de vos sociétés et les transactions d'actions entre elles.
        </p>
      </header>

      <main className="layout">
        <section className="panel">
          <h2>Sociétés</h2>
          <SocietesTable
            societes={societes}
            transactions={transactions}
            onDelete={supprimerSociete}
            onChangerValorisation={changerValorisation}
          />
          <h3>Ajouter une société</h3>
          <SocieteForm onAdd={ajouterSociete} />
        </section>

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
      </main>
    </div>
  );
}

export default App;
