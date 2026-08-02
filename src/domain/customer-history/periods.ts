/**
 * Utilitaires temporels de l'historique client.
 *
 * **Tout est calculé en UTC, sans exception.** Les accesseurs locaux de `Date`
 * (`getMonth`, `getDate`…) dépendent du fuseau de la machine : un rapport
 * calculé à Paris et à New York ne donnerait pas les mêmes périodes, et les
 * tests passeraient ici pour échouer ailleurs. Seuls `Date.UTC` et les
 * accesseurs `getUTC*` sont utilisés.
 *
 * Fonctions pures : aucune `Date` reçue n'est mutée, aucun appel à
 * `Date.now()`, aucune dépendance React ni infrastructure. Aucune bibliothèque
 * de dates : les quelques règles nécessaires (clamping de fin de mois,
 * numérotation ISO-8601) tiennent en une soixantaine de lignes et restent
 * vérifiables.
 */

/** Durée de la fenêtre glissante de l'énoncé, en mois calendaires. */
export const WINDOW_LENGTH_IN_MONTHS = 6;

const MS_PER_DAY = 86_400_000;

export interface DateWindow {
  readonly start: Date;
  readonly end: Date;
}

export interface Period {
  /** `2024-06` pour un mois, `2024-W24` pour une semaine ISO. */
  readonly key: string;
  readonly start: Date;
  readonly end: Date;
}

// --- Garde-fous ---------------------------------------------------------------

function assertValidDate(value: Date, label: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new RangeError(`${label} : date invalide.`);
  }
}

function assertValidWindow(window: DateWindow): void {
  assertValidDate(window.start, 'window.start');
  assertValidDate(window.end, 'window.end');
  if (window.start.getTime() > window.end.getTime()) {
    throw new RangeError(
      `Fenêtre invalide : le début (${window.start.toISOString()}) est postérieur à la fin (${window.end.toISOString()}).`,
    );
  }
}

// --- Primitives UTC -----------------------------------------------------------

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Nombre de jours du mois, en indexation `Date` (0 = janvier). */
function daysInUtcMonth(year: number, monthIndex: number): number {
  // Le jour 0 du mois suivant est le dernier jour du mois demandé.
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  );
}

/**
 * Recule de `months` mois calendaires, à minuit UTC, avec clamping de fin de
 * mois : le 31 août moins 6 mois donne le 29 février en année bissextile et le
 * 28 février sinon. Sans ce clamping, `Date` déborderait sur mars.
 */
function startOfDayMonthsBefore(date: Date, months: number): Date {
  const targetMonthFirstDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1),
  );
  const targetYear = targetMonthFirstDay.getUTCFullYear();
  const targetMonth = targetMonthFirstDay.getUTCMonth();
  const clampedDay = Math.min(date.getUTCDate(), daysInUtcMonth(targetYear, targetMonth));

  return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
}

/** Lundi 00:00:00.000 UTC de la semaine ISO contenant `date`. */
function startOfIsoWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  // getUTCDay : 0 = dimanche. En ISO, lundi vaut 0 et dimanche 6.
  const isoDayIndex = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - isoDayIndex * MS_PER_DAY);
}

/**
 * Clé ISO-8601 `YYYY-Www`.
 *
 * L'année ISO n'est pas l'année calendaire : elle est donnée par le **jeudi**
 * de la semaine. Le 30 décembre 2024 (lundi) appartient ainsi à `2025-W01`, et
 * le 1er janvier 2023 (dimanche) à `2022-W52`.
 */
function toIsoWeekKey(date: Date): string {
  const thursday = new Date(startOfIsoWeek(date).getTime() + 3 * MS_PER_DAY);
  const isoYear = thursday.getUTCFullYear();

  // Le 4 janvier appartient toujours à la semaine ISO 1.
  const firstWeekThursday = new Date(
    startOfIsoWeek(new Date(Date.UTC(isoYear, 0, 4))).getTime() + 3 * MS_PER_DAY,
  );
  const weekNumber = 1 + Math.round((thursday.getTime() - firstWeekThursday.getTime()) / (7 * MS_PER_DAY));

  return `${isoYear}-W${pad2(weekNumber)}`;
}

function toMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

/**
 * Restreint une période brute aux bornes réelles de la fenêtre, en renvoyant
 * toujours de nouvelles `Date` : la fenêtre appelante ne peut donc pas être
 * altérée à travers la période retournée.
 */
function clampToWindow(key: string, start: Date, end: Date, window: DateWindow): Period {
  return {
    key,
    start: new Date(Math.max(start.getTime(), window.start.getTime())),
    end: new Date(Math.min(end.getTime(), window.end.getTime())),
  };
}

// --- API publique -------------------------------------------------------------

/**
 * Fenêtre de six mois calendaires à la granularité du jour, bornes incluses.
 *
 * Référence `2024-11-15T14:00:00Z` →
 * `[2024-05-15T00:00:00.000Z, 2024-11-15T23:59:59.999Z]`.
 *
 * Le choix du jour (et non de l'instant) rend la borne basse réellement
 * inclusive : la commande ORD-2024-080 du 15 mai à 10:00 UTC entre dans la
 * fenêtre, ce qui ne serait pas le cas avec une borne à l'instant près.
 */
export function createSixMonthWindow(referenceDate: Date): DateWindow {
  assertValidDate(referenceDate, 'referenceDate');

  return {
    start: startOfDayMonthsBefore(referenceDate, WINDOW_LENGTH_IN_MONTHS),
    end: endOfUtcDay(referenceDate),
  };
}

export function isDateInWindow(date: Date, window: DateWindow): boolean {
  assertValidDate(date, 'date');
  assertValidWindow(window);

  const time = date.getTime();
  return time >= window.start.getTime() && time <= window.end.getTime();
}

/**
 * Mois calendaires couvrant la fenêtre, du premier au dernier, sans trou ni
 * chevauchement. Les mois de bord sont partiels ; aucune période n'est omise,
 * même si elle ne contiendra aucune commande.
 */
export function createMonthlyPeriods(window: DateWindow): Period[] {
  assertValidWindow(window);

  const firstYear = window.start.getUTCFullYear();
  const firstMonth = window.start.getUTCMonth();
  const monthCount =
    (window.end.getUTCFullYear() - firstYear) * 12 + (window.end.getUTCMonth() - firstMonth);

  const periods: Period[] = [];
  for (let offset = 0; offset <= monthCount; offset += 1) {
    const monthStart = new Date(Date.UTC(firstYear, firstMonth + offset, 1));
    // Dernière milliseconde du mois = première du mois suivant, moins 1 ms.
    const monthEnd = new Date(Date.UTC(firstYear, firstMonth + offset + 1, 1) - 1);
    periods.push(clampToWindow(toMonthKey(monthStart), monthStart, monthEnd, window));
  }

  return periods;
}

/**
 * Semaines ISO-8601 (lundi → dimanche) couvrant la fenêtre. Mêmes garanties
 * que `createMonthlyPeriods` : continuité, bords partiels, périodes vides
 * conservées.
 */
export function createIsoWeeklyPeriods(window: DateWindow): Period[] {
  assertValidWindow(window);

  const periods: Period[] = [];
  let weekStart = startOfIsoWeek(window.start);

  while (weekStart.getTime() <= window.end.getTime()) {
    const weekEnd = new Date(weekStart.getTime() + 7 * MS_PER_DAY - 1);
    periods.push(clampToWindow(toIsoWeekKey(weekStart), weekStart, weekEnd, window));
    weekStart = new Date(weekStart.getTime() + 7 * MS_PER_DAY);
  }

  return periods;
}
