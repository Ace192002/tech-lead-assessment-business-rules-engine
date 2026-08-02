import { describe, expect, it } from 'vitest';

import { parseReferenceDate } from './referenceDate';

describe('parseReferenceDate', () => {
  it('interprète un jour seul à 00:00:00 UTC', () => {
    expect(parseReferenceDate('2024-03-15')?.toISOString()).toBe('2024-03-15T00:00:00.000Z');
  });

  it('accepte le 29 février d\'une année bissextile', () => {
    expect(parseReferenceDate('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  it('rejette un jour hors du mois plutôt que de le reporter', () => {
    // `new Date('2024-02-31T00:00:00Z')` répond le 2 mars 2024 sans rien signaler.
    expect(parseReferenceDate('2024-02-31')).toBeNull();
  });

  it('rejette le 29 février d\'une année non bissextile', () => {
    // `new Date('2023-02-29T00:00:00Z')` répond le 1er mars 2023.
    expect(parseReferenceDate('2023-02-29')).toBeNull();
  });

  it('accepte un horodatage ISO complet tel quel', () => {
    expect(parseReferenceDate('2024-11-15T14:00:00Z')?.toISOString()).toBe(
      '2024-11-15T14:00:00.000Z',
    );
    expect(parseReferenceDate('2024-02-29T10:00:00Z')?.toISOString()).toBe(
      '2024-02-29T10:00:00.000Z',
    );
  });

  it('accepte un décalage UTC explicite et le convertit', () => {
    expect(parseReferenceDate('2024-02-29T10:00:00+02:00')?.toISOString()).toBe(
      '2024-02-29T08:00:00.000Z',
    );
  });

  it('rejette un horodatage sans fuseau explicite', () => {
    // `new Date` interpréterait ces deux formes dans le fuseau local : la même
    // commande donnerait une fenêtre différente selon la machine.
    expect(parseReferenceDate('2024-02-29T10:00:00')).toBeNull();
    expect(parseReferenceDate('2024-02-29 10:00:00')).toBeNull();
  });

  it('rejette un horodatage complet dont l\'heure est invalide', () => {
    // Jour calendaire réel, mais 25 h n'existe pas : `new Date` renvoie NaN.
    expect(parseReferenceDate('2024-02-29T25:00:00Z')).toBeNull();
  });

  it('rejette un horodatage complet posé sur un jour impossible', () => {
    // Le contrôle calendaire porte aussi sur la partie jour d'un horodatage.
    expect(parseReferenceDate('2024-02-31T10:00:00Z')).toBeNull();
  });

  it('rejette les valeurs mal formées', () => {
    expect(parseReferenceDate('')).toBeNull();
    expect(parseReferenceDate('15/03/2024')).toBeNull();
    expect(parseReferenceDate('2024-3-15')).toBeNull();
    expect(parseReferenceDate('pas une date')).toBeNull();
    expect(parseReferenceDate('2024-13-01')).toBeNull();
  });

  it('est pure : deux appels identiques donnent le même résultat', () => {
    expect(parseReferenceDate('2024-03-15')?.getTime()).toBe(
      parseReferenceDate('2024-03-15')?.getTime(),
    );
  });
});
