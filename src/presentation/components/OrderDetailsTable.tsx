import type { HistoryOrder } from '../../domain/customer-history/types';
import { formatDateTime, formatMoney } from '../formatting';

/** Commandes d'une période de l'historique (détail dépliable). */
export function OrderDetailsTable({ orders }: { orders: readonly HistoryOrder[] }) {
  return (
    <div className="table-scroll">
      <table className="sub-table">
        <thead>
          <tr>
            <th scope="col">Commande</th>
            <th scope="col">Date</th>
            <th scope="col">Statut</th>
            <th scope="col" className="num">
              Montant
            </th>
            <th scope="col">Catégories</th>
            <th scope="col" className="num">
              Écart / moyenne
            </th>
            <th scope="col">Anomalie</th>
            <th scope="col">Produits inconnus</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.orderId}>
              <td className="mono">{order.orderId}</td>
              <td className="mono">{formatDateTime(order.orderDate)}</td>
              <td>{order.status}</td>
              <td className="num">
                {order.amount === null ? (
                  <span className="badge badge--warning">Non chiffrable</span>
                ) : (
                  formatMoney(order.amount)
                )}
              </td>
              <td>{order.categories.join(', ')}</td>
              <td className="num">
                {order.anomaly === null ? '—' : `${order.anomaly.deviationPercent.toFixed(2)} %`}
              </td>
              <td>
                {order.anomaly?.isAnomaly === true ? (
                  <span className="badge badge--cancelled">Oui</span>
                ) : (
                  '—'
                )}
              </td>
              <td className="mono">
                {order.missingProductIds.length > 0 ? order.missingProductIds.join(', ') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
