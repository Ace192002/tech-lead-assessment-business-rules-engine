/**
 * Formatage propre à la couche présentation.
 *
 * Volontairement distinct des utilitaires CLI (`scripts/`) : les couches
 * d'entrée/sortie ne s'importent pas entre elles. Aucun arrondi métier
 * supplémentaire : les valeurs reçues du domaine sont déjà arrondies, seul
 * l'affichage (`toFixed`) est décidé ici.
 */

export function formatMoney(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)} EUR`;
}

export function formatSignedMoney(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)} EUR`;
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)} %`;
}

/** `YYYY-MM-DD`, en UTC. */
export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD HH:mm UTC` : lisible sans dépendre du fuseau du navigateur. */
export function formatDateTime(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
