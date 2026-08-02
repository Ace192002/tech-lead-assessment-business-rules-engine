import { describe, expect, it } from 'vitest';

import type { DateWindow } from './periods';
import {
  createIsoWeeklyPeriods,
  createMonthlyPeriods,
  createSixMonthWindow,
  isDateInWindow,
} from './periods';

/** Date de référence du dataset : commande la plus récente (ORD-2024-036). */
const REFERENCE = new Date('2024-11-15T14:00:00Z');

const iso = (date: Date): string => date.toISOString();

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`Index ${index} hors bornes (taille ${items.length})`);
  }
  return value;
}

describe('createSixMonthWindow — bornes de la fenêtre', () => {
  it('couvre du 15 mai au 15 novembre 2024, bornes incluses', () => {
    const window = createSixMonthWindow(REFERENCE);

    expect(iso(window.start)).toBe('2024-05-15T00:00:00.000Z');
    expect(iso(window.end)).toBe('2024-11-15T23:59:59.999Z');
  });

  it('ignore l\'heure de la date de référence pour la borne basse', () => {
    // Quelle que soit l'heure du 15 novembre, la fenêtre démarre au premier
    // instant du 15 mai.
    expect(iso(createSixMonthWindow(new Date('2024-11-15T00:00:00Z')).start)).toBe(
      '2024-05-15T00:00:00.000Z',
    );
    expect(iso(createSixMonthWindow(new Date('2024-11-15T23:59:59.999Z')).start)).toBe(
      '2024-05-15T00:00:00.000Z',
    );
  });
});

describe('isDateInWindow — inclusivité des bornes', () => {
  const window = createSixMonthWindow(REFERENCE);

  it('inclut ORD-2024-080, datée du 15 mai à 10:00 UTC', () => {
    expect(isDateInWindow(new Date('2024-05-15T10:00:00Z'), window)).toBe(true);
  });

  it('inclut le tout premier instant de la borne basse', () => {
    expect(isDateInWindow(new Date('2024-05-15T00:00:00.000Z'), window)).toBe(true);
  });

  it('exclut le 14 mai, y compris sa dernière milliseconde', () => {
    expect(isDateInWindow(new Date('2024-05-14T23:59:59.999Z'), window)).toBe(false);
    expect(isDateInWindow(new Date('2024-05-14T10:00:00Z'), window)).toBe(false);
  });

  it('inclut toute heure du 15 novembre', () => {
    expect(isDateInWindow(new Date('2024-11-15T00:00:00.000Z'), window)).toBe(true);
    expect(isDateInWindow(new Date('2024-11-15T14:00:00.000Z'), window)).toBe(true);
    expect(isDateInWindow(new Date('2024-11-15T23:59:59.999Z'), window)).toBe(true);
  });

  it('exclut le 16 novembre dès sa première milliseconde', () => {
    expect(isDateInWindow(new Date('2024-11-16T00:00:00.000Z'), window)).toBe(false);
  });
});

describe('clamping de fin de mois', () => {
  it('ramène le 31 août 2024 au 29 février 2024 (année bissextile)', () => {
    expect(iso(createSixMonthWindow(new Date('2024-08-31T12:00:00Z')).start)).toBe(
      '2024-02-29T00:00:00.000Z',
    );
  });

  it('ramène le 31 août 2023 au 28 février 2023 (année non bissextile)', () => {
    expect(iso(createSixMonthWindow(new Date('2023-08-31T12:00:00Z')).start)).toBe(
      '2023-02-28T00:00:00.000Z',
    );
  });

  it('gère le passage à l\'année précédente et le clamping simultanés', () => {
    // 31 mars 2024 − 6 mois → septembre 2023, qui n'a que 30 jours.
    expect(iso(createSixMonthWindow(new Date('2024-03-31T08:00:00Z')).start)).toBe(
      '2023-09-30T00:00:00.000Z',
    );
  });

  it('ne clampe pas lorsque le jour existe dans le mois cible', () => {
    expect(iso(createSixMonthWindow(new Date('2024-07-30T00:00:00Z')).start)).toBe(
      '2024-01-30T00:00:00.000Z',
    );
  });
});

describe('pureté', () => {
  it('ne mute jamais la Date reçue', () => {
    const reference = new Date('2024-08-31T12:34:56.789Z');
    const before = reference.getTime();

    const window = createSixMonthWindow(reference);
    createMonthlyPeriods(window);
    createIsoWeeklyPeriods(window);
    isDateInWindow(reference, window);

    expect(reference.getTime()).toBe(before);
    expect(iso(reference)).toBe('2024-08-31T12:34:56.789Z');
  });

  it('ne partage aucune instance de Date entre la fenêtre et les périodes', () => {
    const window = createSixMonthWindow(REFERENCE);
    const firstMonth = at(createMonthlyPeriods(window), 0);
    const firstWeek = at(createIsoWeeklyPeriods(window), 0);

    // Les bornes coïncident, mais muter une période ne doit pas altérer la fenêtre.
    expect(firstMonth.start.getTime()).toBe(window.start.getTime());
    expect(firstMonth.start).not.toBe(window.start);
    expect(firstWeek.start).not.toBe(window.start);
  });
});

describe('createMonthlyPeriods', () => {
  const window = createSixMonthWindow(REFERENCE);
  const periods = createMonthlyPeriods(window);

  it('génère tous les mois intersectant la fenêtre, y compris ceux sans commande', () => {
    expect(periods.map((period) => period.key)).toEqual([
      '2024-05',
      '2024-06',
      '2024-07',
      '2024-08',
      '2024-09',
      '2024-10',
      '2024-11',
    ]);
  });

  it('produit des mois de bord partiels, limités aux bornes de la fenêtre', () => {
    const first = at(periods, 0);
    expect(iso(first.start)).toBe('2024-05-15T00:00:00.000Z');
    expect(iso(first.end)).toBe('2024-05-31T23:59:59.999Z');

    const last = at(periods, periods.length - 1);
    expect(iso(last.start)).toBe('2024-11-01T00:00:00.000Z');
    expect(iso(last.end)).toBe('2024-11-15T23:59:59.999Z');
  });

  it('produit des mois intermédiaires complets', () => {
    const june = at(periods, 1);
    expect(june.key).toBe('2024-06');
    expect(iso(june.start)).toBe('2024-06-01T00:00:00.000Z');
    expect(iso(june.end)).toBe('2024-06-30T23:59:59.999Z');
  });

  it('est continu : ni trou ni chevauchement entre deux mois consécutifs', () => {
    for (let index = 1; index < periods.length; index += 1) {
      const previous = at(periods, index - 1);
      const current = at(periods, index);
      expect(current.start.getTime()).toBe(previous.end.getTime() + 1);
    }
  });

  it('couvre exactement la fenêtre, sans déborder', () => {
    expect(at(periods, 0).start.getTime()).toBe(window.start.getTime());
    expect(at(periods, periods.length - 1).end.getTime()).toBe(window.end.getTime());
  });
});

describe('createIsoWeeklyPeriods', () => {
  const window = createSixMonthWindow(REFERENCE);
  const periods = createIsoWeeklyPeriods(window);

  it('génère toutes les semaines intersectant la fenêtre, y compris celles sans commande', () => {
    expect(periods).toHaveLength(27);
    expect(at(periods, 0).key).toBe('2024-W20');
    expect(at(periods, periods.length - 1).key).toBe('2024-W46');
  });

  it('découpe les semaines du lundi au dimanche', () => {
    // Deuxième période : première semaine entièrement contenue dans la fenêtre.
    const fullWeek = at(periods, 1);
    expect(fullWeek.key).toBe('2024-W21');
    expect(iso(fullWeek.start)).toBe('2024-05-20T00:00:00.000Z'); // lundi
    expect(iso(fullWeek.end)).toBe('2024-05-26T23:59:59.999Z'); // dimanche
    expect(fullWeek.start.getUTCDay()).toBe(1);
    expect(fullWeek.end.getUTCDay()).toBe(0);
  });

  it('limite les semaines de bord aux bornes réelles de la fenêtre', () => {
    // La semaine ISO commence le lundi 13 mai, la fenêtre le mercredi 15.
    const first = at(periods, 0);
    expect(iso(first.start)).toBe('2024-05-15T00:00:00.000Z');
    expect(iso(first.end)).toBe('2024-05-19T23:59:59.999Z');

    // La dernière semaine irait jusqu'au dimanche 17 novembre.
    const last = at(periods, periods.length - 1);
    expect(iso(last.start)).toBe('2024-11-11T00:00:00.000Z');
    expect(iso(last.end)).toBe('2024-11-15T23:59:59.999Z');
  });

  it('est continu : ni trou ni chevauchement entre deux semaines consécutives', () => {
    for (let index = 1; index < periods.length; index += 1) {
      const previous = at(periods, index - 1);
      const current = at(periods, index);
      expect(current.start.getTime()).toBe(previous.end.getTime() + 1);
    }
  });
});

describe('numérotation ISO-8601 au changement d\'année', () => {
  it('rattache le lundi 30 décembre 2024 à la semaine 2025-W01', () => {
    const window: DateWindow = {
      start: new Date('2024-12-23T00:00:00.000Z'),
      end: new Date('2025-01-05T23:59:59.999Z'),
    };

    expect(createIsoWeeklyPeriods(window).map((period) => period.key)).toEqual([
      '2024-W52',
      '2025-W01',
    ]);
  });

  it('rattache le dimanche 1er janvier 2023 à la semaine 2022-W52', () => {
    const window: DateWindow = {
      start: new Date('2023-01-01T00:00:00.000Z'),
      end: new Date('2023-01-01T23:59:59.999Z'),
    };

    expect(createIsoWeeklyPeriods(window).map((period) => period.key)).toEqual(['2022-W52']);
  });

  it('numérote la semaine 53 des années ISO longues', () => {
    // 2020 compte 53 semaines ISO ; le 31 décembre 2020 (jeudi) est en W53.
    const window: DateWindow = {
      start: new Date('2020-12-31T00:00:00.000Z'),
      end: new Date('2020-12-31T23:59:59.999Z'),
    };

    expect(createIsoWeeklyPeriods(window).map((period) => period.key)).toEqual(['2020-W53']);
  });
});

describe('rejets explicites', () => {
  const validWindow = createSixMonthWindow(REFERENCE);
  const invalidDate = new Date('pas une date');

  it('rejette une date de référence invalide', () => {
    expect(() => createSixMonthWindow(invalidDate)).toThrow(RangeError);
    expect(() => createSixMonthWindow(invalidDate)).toThrow(/date invalide/);
  });

  it('rejette une date à tester invalide', () => {
    expect(() => isDateInWindow(invalidDate, validWindow)).toThrow(RangeError);
  });

  it('rejette une fenêtre contenant une date invalide', () => {
    const broken: DateWindow = { start: invalidDate, end: new Date('2024-11-15T00:00:00Z') };

    expect(() => createMonthlyPeriods(broken)).toThrow(RangeError);
    expect(() => createIsoWeeklyPeriods(broken)).toThrow(RangeError);
    expect(() => isDateInWindow(new Date('2024-06-01T00:00:00Z'), broken)).toThrow(RangeError);
  });

  it('rejette une fenêtre dont le début est postérieur à la fin', () => {
    const inverted: DateWindow = {
      start: new Date('2024-11-15T00:00:00.000Z'),
      end: new Date('2024-05-15T00:00:00.000Z'),
    };

    expect(() => createMonthlyPeriods(inverted)).toThrow(/Fenêtre invalide/);
    expect(() => createIsoWeeklyPeriods(inverted)).toThrow(/Fenêtre invalide/);
    expect(() => isDateInWindow(new Date('2024-06-01T00:00:00Z'), inverted)).toThrow(
      /Fenêtre invalide/,
    );
  });

  it('accepte une fenêtre réduite à un instant unique', () => {
    const instant = new Date('2024-06-01T12:00:00.000Z');
    const single: DateWindow = { start: instant, end: instant };

    expect(createMonthlyPeriods(single)).toHaveLength(1);
    expect(createIsoWeeklyPeriods(single)).toHaveLength(1);
    expect(isDateInWindow(instant, single)).toBe(true);
  });
});
