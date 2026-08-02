import { useMemo, useState } from 'react';

import { generateCustomerHistory } from '../domain/customer-history/generateCustomerHistory';
import type { CustomerHistoryReport } from '../domain/customer-history/types';
import { DomainError } from '../domain/errors';
import { parseReferenceDate } from '../domain/referenceDate';
import type { LoadedData } from '../infrastructure/data/loadData';
import { ErrorPanel } from './components/ErrorPanel';
import { PeriodTable } from './components/PeriodTable';
import { SummaryCard } from './components/SummaryCard';
import { formatDateTime, formatMoney } from './formatting';

const DEFAULT_CUSTOMER_ID = 'C001';

type Outcome =
  | { readonly kind: 'report'; readonly report: CustomerHistoryReport }
  | { readonly kind: 'error'; readonly title: string; readonly message: string };

/**
 * Question 1 — page de vérification de l'historique client.
 * Aucune logique métier : la page choisit un client et une date, appelle
 * `generateCustomerHistory` et affiche le rapport tel quel.
 */
export function CustomerHistoryPage({ data }: { data: LoadedData }) {
  const [customerId, setCustomerId] = useState(DEFAULT_CUSTOMER_ID);
  const [referenceDateInput, setReferenceDateInput] = useState('');

  const outcome = useMemo<Outcome>(() => {
    let referenceDate: Date | undefined;

    if (referenceDateInput !== '') {
      // Même validation que la CLI : jour interprété en UTC, dates impossibles
      // (2024-02-31) rejetées au lieu d'être reportées au mois suivant.
      const parsed = parseReferenceDate(referenceDateInput);
      if (parsed === null) {
        return {
          kind: 'error',
          title: 'Date de référence invalide',
          message: `"${referenceDateInput}" n'est pas une date valide (format attendu : YYYY-MM-DD).`,
        };
      }
      referenceDate = parsed;
    }

    try {
      return {
        kind: 'report',
        report: generateCustomerHistory({
          customerId,
          customersById: data.indexes.customersById,
          productsById: data.indexes.productsById,
          orders: data.dataset.orders,
          ...(referenceDate === undefined ? {} : { referenceDate }),
        }),
      };
    } catch (error) {
      return {
        kind: 'error',
        title: error instanceof DomainError ? error.name : 'Erreur',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }, [customerId, referenceDateInput, data]);

  return (
    <div className="page">
      <section className="card controls" aria-label="Paramètres du rapport">
        <div className="control">
          <label htmlFor="history-customer">Client</label>
          <select
            id="history-customer"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            {data.dataset.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.id} — {customer.name} — {customer.type}
              </option>
            ))}
          </select>
        </div>
        <div className="control">
          <label htmlFor="history-reference-date">Date de référence (optionnelle)</label>
          <input
            id="history-reference-date"
            type="date"
            value={referenceDateInput}
            onChange={(event) => setReferenceDateInput(event.target.value)}
          />
          <p className="hint">Vide : date de la commande la plus récente du dataset (jour UTC).</p>
        </div>
      </section>

      {outcome.kind === 'error' ? (
        <ErrorPanel title={outcome.title} message={outcome.message} />
      ) : (
        <HistoryReport report={outcome.report} />
      )}
    </div>
  );
}

function HistoryReport({ report }: { report: CustomerHistoryReport }) {
  // Comptages d'affichage dérivés du rapport : aucune règle métier rejouée.
  const orders = report.periods.flatMap((period) => period.orders);
  const anomalyCount = orders.filter((order) => order.anomaly?.isAnomaly).length;
  const unpricedCount = orders.filter((order) => order.amount === null).length;

  return (
    <>
      <SummaryCard
        title="Résumé"
        items={[
          { label: 'Client', value: `${report.customer.id} — ${report.customer.name}` },
          { label: 'Type', value: report.customer.type },
          {
            label: 'Fenêtre',
            value: `${formatDateTime(report.window.start)} → ${formatDateTime(report.window.end)}`,
          },
          {
            label: 'Rythme',
            value: (
              <>
                {report.rhythm.kind === 'regular' ? 'regular (régulier)' : 'occasional (occasionnel)'}
              </>
            ),
          },
          {
            label: 'Commandes / mois',
            value: report.rhythm.averageOrdersPerMonth.toFixed(2),
          },
          {
            label: 'Regroupement',
            value: report.rhythm.grouping === 'week' ? 'par semaine (ISO)' : 'par mois',
          },
          { label: 'Moyenne client', value: formatMoney(report.customerAverageAmount) },
          { label: 'Périodes', value: report.periods.length },
          { label: 'Commandes', value: orders.length },
          { label: 'Anomalies', value: anomalyCount },
          { label: 'Non chiffrables', value: unpricedCount },
        ]}
      />
      <PeriodTable periods={report.periods} />
    </>
  );
}
