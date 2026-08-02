import type { RuleTraceEntry } from '../../domain/pricing/types';
import { formatMoney, formatSignedMoney } from '../formatting';

/**
 * Trace complète du moteur, dans l'ordre réel d'exécution. Les règles
 * `skipped` restent visibles : elles prouvent pourquoi une règle ne s'est pas
 * appliquée.
 */
export function RuleTraceTable({ trace }: { trace: readonly RuleTraceEntry[] }) {
  return (
    <section className="card" aria-label="Trace des règles">
      <h3 className="card-title">Trace des règles ({trace.length})</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col" className="num">
                Priorité
              </th>
              <th scope="col">Règle</th>
              <th scope="col">Famille</th>
              <th scope="col" className="num">
                Passage
              </th>
              <th scope="col">Issue</th>
              <th scope="col" className="num">
                Avant
              </th>
              <th scope="col" className="num">
                Après
              </th>
              <th scope="col" className="num">
                Impact
              </th>
              <th scope="col">Raison</th>
            </tr>
          </thead>
          <tbody>
            {trace.map((entry) => (
              <tr key={entry.ruleId}>
                <td className="num">{entry.priority}</td>
                <td className="mono">{entry.ruleId}</td>
                <td>{entry.family}</td>
                <td className="num">{entry.iteration}</td>
                <td>
                  <span className={`badge badge--${entry.outcome}`}>{entry.outcome}</span>
                </td>
                <td className="num">{formatMoney(entry.amountBefore)}</td>
                <td className="num">{formatMoney(entry.amountAfter)}</td>
                <td className="num">{formatSignedMoney(entry.impact)}</td>
                <td className="reason">{entry.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
