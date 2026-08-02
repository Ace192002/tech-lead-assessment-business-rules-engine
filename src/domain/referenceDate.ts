/**
 * Validation de la date de référence, partagée par la CLI et l'interface.
 *
 * Cette validation existait en double — dans `scripts/cliUtils.ts` et dans
 * `CustomerHistoryPage.tsx` — avec deux comportements divergents, et aucune des
 * deux ne rejetait les dates calendaires impossibles : `new Date` reporte
 * silencieusement les jours hors mois (`2024-02-31` devient le 2 mars 2024,
 * `2023-02-29` le 1er mars 2023). Le rapport était alors calculé sur une
 * fenêtre que l'utilisateur n'avait pas demandée, sans le moindre signal.
 *
 * Fonction pure : aucune lecture d'horloge, aucun effet de bord, aucune
 * dépendance au fuseau de la machine.
 */

/**
 * Jour seul (`YYYY-MM-DD`), ou horodatage ISO à fuseau **explicite** :
 * `YYYY-MM-DDTHH:mm:ss[.fraction](Z|±HH:mm)`.
 *
 * Le fuseau est obligatoire sur un horodatage, et le séparateur espace est
 * refusé : `new Date('2024-02-29T10:00:00')` comme
 * `new Date('2024-02-29 10:00:00')` sont interprétés dans le fuseau **local**
 * de la machine. La même commande produirait alors une fenêtre différente à
 * Paris et à Tokyo, sans que rien ne le signale. Un jour seul reste accepté :
 * il est explicitement ancré à 00:00:00 UTC ci-dessous.
 */
const REFERENCE_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;

/** Longueur de la partie calendaire `YYYY-MM-DD`. */
const DAY_LENGTH = 10;

/**
 * Vérifie que les composants saisis survivent à l'aller-retour UTC.
 *
 * C'est ce contrôle qui distingue une date réelle d'une date reportée : pour
 * `2024-02-31`, `new Date` répond le 2 mars, dont le quantième (2) ne
 * correspond plus au jour demandé (31).
 */
function isRealCalendarDay(day: string): boolean {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const dayOfMonth = Number(day.slice(8, 10));

  const probe = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(probe.getTime())) {
    return false;
  }

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === dayOfMonth
  );
}

/**
 * Analyse une date de référence.
 *
 * - `YYYY-MM-DD` : interprétée comme ce jour à 00:00:00 UTC, sans décalage de
 *   fuseau — deux machines produisent ainsi la même fenêtre ;
 * - horodatage ISO à fuseau explicite (`...Z` ou `...±HH:mm`) : accepté après
 *   validation par `new Date`, et ramené à l'instant absolu correspondant.
 *
 * Retourne `null` — jamais une date approchante — si la valeur est mal formée,
 * calendairement impossible, dépourvue de fuseau explicite, ou si l'horodatage
 * est invalide.
 */
export function parseReferenceDate(value: string): Date | null {
  if (!REFERENCE_DATE_SHAPE.test(value)) {
    return null;
  }

  const day = value.slice(0, DAY_LENGTH);
  if (!isRealCalendarDay(day)) {
    return null;
  }

  // Jour seul : la partie calendaire vient d'être validée en UTC, on la garde.
  if (value.length === DAY_LENGTH) {
    return new Date(`${day}T00:00:00Z`);
  }

  // Horodatage : le jour est réel et le fuseau explicite ; reste l'heure (`T25:00:00`…).
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
