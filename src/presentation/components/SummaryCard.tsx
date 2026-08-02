import type { ReactNode } from 'react';

export interface SummaryItem {
  readonly label: string;
  readonly value: ReactNode;
}

/** Grille compacte de paires libellé/valeur, utilisée par les deux pages. */
export function SummaryCard({ title, items }: { title: string; items: readonly SummaryItem[] }) {
  return (
    <section className="card" aria-label={title}>
      <h3 className="card-title">{title}</h3>
      <dl className="summary-grid">
        {items.map((item) => (
          <div className="summary-item" key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
