/**
 * Coquille de l'application.
 *
 * Conformément au principe « React ne contient aucune logique métier », ce
 * composant se contentera d'appeler les fonctions du domaine et d'afficher
 * leur résultat. Les pages Historique client et Pricing sont ajoutées plus
 * tard, une fois le domaine implémenté et testé.
 */
export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Test technique — Tech Lead</h1>
      <p>Interface à venir : historique client et moteur de pricing.</p>
    </main>
  );
}
