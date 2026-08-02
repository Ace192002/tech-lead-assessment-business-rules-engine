/** Affichage uniforme d'une erreur métier ou inattendue. Jamais masquée. */
export function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <section className="card error-panel" role="alert">
      <h3 className="card-title">{title}</h3>
      <p>{message}</p>
    </section>
  );
}
