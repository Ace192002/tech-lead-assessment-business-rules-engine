import { useMemo, useState } from 'react';

import { DomainError } from '../domain/errors';
import { calculateOrderPrice } from '../domain/pricing/calculateOrderPrice';
import type { OrderPricingResult } from '../domain/pricing/types';
import type { LoadedData } from '../infrastructure/data/loadData';
import { ErrorPanel } from './components/ErrorPanel';
import { PricingLinesTable } from './components/PricingLinesTable';
import { RuleTraceTable } from './components/RuleTraceTable';
import { SummaryCard } from './components/SummaryCard';
import { formatDay, formatMoney, formatSignedMoney } from './formatting';

const DEFAULT_ORDER_ID = 'ORD-2024-001';

type Outcome =
  | { readonly kind: 'result'; readonly result: OrderPricingResult }
  | { readonly kind: 'error'; readonly title: string; readonly message: string };

/**
 * Question 2 — page de vérification du moteur de pricing.
 * Toutes les commandes restent sélectionnables, y compris ORD-2024-077 et
 * ORD-2024-079 : leur sélection démontre la gestion des références inconnues.
 */
export function PricingPage({ data }: { data: LoadedData }) {
  const [orderId, setOrderId] = useState(DEFAULT_ORDER_ID);

  const outcome = useMemo<Outcome>(() => {
    try {
      return {
        kind: 'result',
        result: calculateOrderPrice({
          orderId,
          orders: data.dataset.orders,
          customersById: data.indexes.customersById,
          productsById: data.indexes.productsById,
        }),
      };
    } catch (error) {
      return {
        kind: 'error',
        title: error instanceof DomainError ? error.name : 'Erreur',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }, [orderId, data]);

  return (
    <div className="page">
      <section className="card controls" aria-label="Paramètres du calcul">
        <div className="control">
          <label htmlFor="pricing-order">Commande</label>
          <select
            id="pricing-order"
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
          >
            {data.dataset.orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.id} — {order.customerId} — {formatDay(order.orderDate)} — {order.status}
              </option>
            ))}
          </select>
        </div>
      </section>

      {outcome.kind === 'error' ? (
        <ErrorPanel title={outcome.title} message={outcome.message} />
      ) : (
        <PricingResult result={outcome.result} />
      )}
    </div>
  );
}

function PricingResult({ result }: { result: OrderPricingResult }) {
  return (
    <>
      <SummaryCard
        title="Résumé"
        items={[
          { label: 'Commande', value: result.orderId },
          { label: 'Client', value: result.customerId },
          { label: 'Prix de base', value: formatMoney(result.basePrice) },
          { label: 'Prix final', value: <strong>{formatMoney(result.finalPrice)}</strong> },
          { label: 'Différence', value: formatSignedMoney(result.finalPrice - result.basePrice) },
          { label: 'Passages moteur', value: result.iterations },
        ]}
      />
      <PricingLinesTable lines={result.lines} adjustments={result.adjustments} />
      <RuleTraceTable trace={result.trace} />
    </>
  );
}
