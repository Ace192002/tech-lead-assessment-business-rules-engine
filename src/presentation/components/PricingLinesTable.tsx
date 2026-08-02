import type { OrderAdjustment, PricedOrderLine } from '../../domain/pricing/types';
import { formatMoney, formatSignedMoney } from '../formatting';

/** Lignes tarifaires et ajustements fixes du résultat de pricing. */
export function PricingLinesTable({
  lines,
  adjustments,
}: {
  lines: readonly PricedOrderLine[];
  adjustments: readonly OrderAdjustment[];
}) {
  return (
    <section className="card" aria-label="Lignes tarifaires">
      <h3 className="card-title">Lignes tarifaires</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Produit</th>
              <th scope="col" className="num">
                Quantité
              </th>
              <th scope="col" className="num">
                Prix unitaire
              </th>
              <th scope="col">Catégories</th>
              <th scope="col" className="num">
                Montant brut
              </th>
              <th scope="col" className="num">
                Montant final
              </th>
              <th scope="col" className="num">
                Différence
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Le moteur ne fusionne pas deux lignes portant le même produit :
                l'identifiant seul ne suffit donc pas à distinguer les lignes. */}
            {lines.map((line, index) => (
              <tr key={`${line.productId}-${index}`}>
                <td className="mono">{line.productId}</td>
                <td className="num">{line.quantity}</td>
                <td className="num">{formatMoney(line.unitPrice)}</td>
                <td>{line.categories.join(', ')}</td>
                <td className="num">{formatMoney(line.baseAmount)}</td>
                <td className="num">{formatMoney(line.finalAmount)}</td>
                <td className="num">{formatSignedMoney(line.finalAmount - line.baseAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="card-subtitle">Ajustements fixes</h4>
      {adjustments.length === 0 ? (
        <p className="muted">Aucun ajustement fixe</p>
      ) : (
        <ul className="adjustment-list">
          {adjustments.map((adjustment) => (
            <li key={adjustment.ruleId}>
              {adjustment.label} : <strong>{formatSignedMoney(adjustment.amount)}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
