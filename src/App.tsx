import { useMemo, useState } from 'react';

import { loadData } from './infrastructure/data/loadData';
import { CustomerHistoryPage } from './presentation/CustomerHistoryPage';
import { DataIssuesPanel } from './presentation/components/DataIssuesPanel';
import { PricingPage } from './presentation/PricingPage';

type Tab = 'history' | 'pricing';

/**
 * Coquille de l'application : chargement unique du dataset, onglets et panneau
 * de qualité des données. Toute la logique métier vit dans `src/domain`.
 */
export function App() {
  const data = useMemo(() => loadData(), []);
  const [activeTab, setActiveTab] = useState<Tab>('history');
  const [issuesOpen, setIssuesOpen] = useState(false);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Hello Pomelo — Tech Lead Assessment</h1>
          <p className="subtitle">
            Interface de vérification du domaine TypeScript — historique client et moteur de pricing.
          </p>
        </div>
        <button
          type="button"
          className="issues-toggle"
          aria-expanded={issuesOpen}
          onClick={() => setIssuesOpen((open) => !open)}
        >
          {data.issues.length} anomalies de qualité de données détectées
          <span aria-hidden="true">{issuesOpen ? ' ▲' : ' ▼'}</span>
        </button>
      </header>

      {issuesOpen ? <DataIssuesPanel issues={data.issues} /> : null}

      <nav className="tabs" aria-label="Questions">
        <button
          type="button"
          className={activeTab === 'history' ? 'tab tab--active' : 'tab'}
          aria-pressed={activeTab === 'history'}
          onClick={() => setActiveTab('history')}
        >
          Question 1 — Historique client
        </button>
        <button
          type="button"
          className={activeTab === 'pricing' ? 'tab tab--active' : 'tab'}
          aria-pressed={activeTab === 'pricing'}
          onClick={() => setActiveTab('pricing')}
        >
          Question 2 — Moteur de pricing
        </button>
      </nav>

      <main>{activeTab === 'history' ? <CustomerHistoryPage data={data} /> : <PricingPage data={data} />}</main>
    </div>
  );
}
