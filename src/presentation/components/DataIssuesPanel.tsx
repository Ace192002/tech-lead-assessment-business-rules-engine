import type { DataIssue } from '../../infrastructure/data/dataIssues';

/** Détail des anomalies de qualité du dataset, dépliable depuis l'entête. */
export function DataIssuesPanel({ issues }: { issues: readonly DataIssue[] }) {
  return (
    <section className="card" aria-label="Anomalies de qualité de données">
      <h3 className="card-title">Anomalies de qualité de données ({issues.length})</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Sévérité</th>
              <th scope="col">Code</th>
              <th scope="col">Entité</th>
              <th scope="col">Champ</th>
              <th scope="col">Message</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr key={`${issue.code}-${issue.entityId}-${issue.field ?? ''}`}>
                <td>
                  <span className={`badge badge--${issue.severity}`}>{issue.severity}</span>
                </td>
                <td className="mono">{issue.code}</td>
                <td className="mono">
                  {issue.entity}/{issue.entityId}
                </td>
                <td className="mono">{issue.field ?? '—'}</td>
                <td>{issue.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
