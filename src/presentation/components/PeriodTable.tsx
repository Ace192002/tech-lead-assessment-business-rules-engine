import { Fragment, useState } from 'react';

import type { HistoryPeriod } from '../../domain/customer-history/types';
import { formatDay, formatMoney, formatPercent } from '../formatting';
import { OrderDetailsTable } from './OrderDetailsTable';

/**
 * Toutes les périodes de la fenêtre, y compris vides (une ligne discrète).
 * Le détail des commandes s'ouvre période par période, pour éviter le mur de
 * 27 semaines entièrement dépliées.
 */
export function PeriodTable({ periods }: { periods: readonly HistoryPeriod[] }) {
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(new Set());

  const toggle = (key: string): void => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <section className="card" aria-label="Périodes">
      <h3 className="card-title">Périodes ({periods.length})</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Période</th>
              <th scope="col">Début</th>
              <th scope="col">Fin</th>
              <th scope="col" className="num">
                Commandes
              </th>
              <th scope="col" className="num">
                Chiffrables
              </th>
              <th scope="col" className="num">
                Total
              </th>
              <th scope="col" className="num">
                Moyenne
              </th>
              <th scope="col" className="num">
                Évolution
              </th>
              <th scope="col">
                <span className="visually-hidden">Détails</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => {
              const isEmpty = period.orderCount === 0;
              const isExpanded = expandedKeys.has(period.key);

              return (
                <Fragment key={period.key}>
                  <tr className={isEmpty ? 'row--empty' : undefined}>
                    <td className="mono">
                      {period.key}
                      {period.isPartial ? <span className="badge badge--warning">partielle</span> : null}
                    </td>
                    <td className="mono">{formatDay(period.start)}</td>
                    <td className="mono">{formatDay(period.end)}</td>
                    <td className="num">{period.orderCount}</td>
                    <td className="num">{period.pricedOrderCount}</td>
                    <td className="num">{formatMoney(period.totalAmount)}</td>
                    <td className="num">{formatMoney(period.averageAmount)}</td>
                    <td className="num">{formatPercent(period.evolutionPercent)}</td>
                    <td>
                      {isEmpty ? null : (
                        <button
                          type="button"
                          className="link-button"
                          aria-expanded={isExpanded}
                          onClick={() => toggle(period.key)}
                        >
                          {isExpanded ? 'Réduire' : `Détails (${period.orderCount})`}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="row--detail">
                      <td colSpan={9}>
                        <OrderDetailsTable orders={period.orders} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
