import { describe, expect, it } from 'vitest';

import { calculateGrossOrderAmount, collectOrderCategories } from './calculateGrossOrderAmount';
import type { Order, Product } from './model';
import { roundToTwoDecimals } from './rounding';

function makeProduct(id: string, price: number, categories: string[]): Product {
  return { id, name: `Produit ${id}`, price, categories };
}

function makeOrder(items: Array<{ productId: string; quantity: number }>): Order {
  return {
    id: 'ORD-TEST',
    customerId: 'C001',
    orderDate: new Date('2024-06-15T10:30:00Z'),
    status: 'Delivered',
    expressDelivery: false,
    items,
  };
}

const CATALOG: ReadonlyMap<string, Product> = new Map([
  ['P001', makeProduct('P001', 799.99, ['Électronique', 'High-Tech'])],
  ['P003', makeProduct('P003', 89.99, ['Électronique', 'Audio'])],
  ['P004', makeProduct('P004', 12.5, ['Alimentaire'])],
  ['P005', makeProduct('P005', 4.99, ['Alimentaire', 'Gourmandise'])],
]);

describe('roundToTwoDecimals', () => {
  it('arrondit au centime', () => {
    expect(roundToTwoDecimals(12.344)).toBe(12.34);
    expect(roundToTwoDecimals(12.345)).toBe(12.35);
    expect(roundToTwoDecimals(62.45000000000001)).toBe(62.45);
  });

  it('compense la représentation binaire des flottants', () => {
    // Sans Number.EPSILON, 1.005 * 100 vaut 100.49999999999999 et donnerait 1.
    expect(roundToTwoDecimals(1.005)).toBe(1.01);
  });

  it('arrondit les négatifs symétriquement aux positifs', () => {
    // Math.round arrondit les demis vers +∞ : sans correction, -1,005 donnait
    // -1,00 alors que 1,005 donne 1,01.
    expect(roundToTwoDecimals(-1.005)).toBe(-1.01);
    expect(roundToTwoDecimals(-2.675)).toBe(-2.68);
    expect(roundToTwoDecimals(-12.344)).toBe(-12.34);
    expect(roundToTwoDecimals(-1.005)).toBe(-roundToTwoDecimals(1.005));
  });

  it('laisse intactes les valeurs déjà arrondies', () => {
    expect(roundToTwoDecimals(0)).toBe(0);
    expect(roundToTwoDecimals(799.99)).toBe(799.99);
  });
});

describe('calculateGrossOrderAmount', () => {
  it('somme prix × quantité sur plusieurs lignes', () => {
    // 799,99 × 1 + 89,99 × 2 = 979,97
    const result = calculateGrossOrderAmount(
      makeOrder([
        { productId: 'P001', quantity: 1 },
        { productId: 'P003', quantity: 2 },
      ]),
      CATALOG,
    );

    expect(result.amount).toBe(979.97);
    expect(result.missingProductIds).toEqual([]);
  });

  it('gère les quantités multiples et les décimales flottantes', () => {
    // 12,50 × 3 + 4,99 × 5 = 37,50 + 24,95 = 62,45
    const result = calculateGrossOrderAmount(
      makeOrder([
        { productId: 'P004', quantity: 3 },
        { productId: 'P005', quantity: 5 },
      ]),
      CATALOG,
    );

    expect(result.amount).toBe(62.45);
  });

  it('n\'applique ni remise, ni taxe, ni frais de livraison', () => {
    const order: Order = { ...makeOrder([{ productId: 'P001', quantity: 1 }]), expressDelivery: true };

    // Prix catalogue strict : ni +15 € express, ni +20 % de taxe Électronique.
    expect(calculateGrossOrderAmount(order, CATALOG).amount).toBe(799.99);
  });

  it('rend la commande entière non chiffrable dès qu\'un produit est inconnu', () => {
    const result = calculateGrossOrderAmount(
      makeOrder([
        { productId: 'P999', quantity: 1 },
        { productId: 'P001', quantity: 1 },
      ]),
      CATALOG,
    );

    // Surtout pas 799,99 : un total partiel serait faux sans que rien ne l'indique.
    expect(result.amount).toBeNull();
    expect(result.missingProductIds).toEqual(['P999']);
  });

  it('déduplique les références manquantes en conservant l\'ordre d\'apparition', () => {
    const result = calculateGrossOrderAmount(
      makeOrder([
        { productId: 'P998', quantity: 1 },
        { productId: 'P999', quantity: 1 },
        { productId: 'P998', quantity: 2 },
      ]),
      CATALOG,
    );

    expect(result.missingProductIds).toEqual(['P998', 'P999']);
  });

  it('ne mute ni la commande, ni ses items, ni le catalogue', () => {
    const order = makeOrder([
      { productId: 'P001', quantity: 1 },
      { productId: 'P999', quantity: 3 },
    ]);
    const snapshot = JSON.stringify(order);
    const catalogSnapshot = JSON.stringify([...CATALOG.entries()]);

    calculateGrossOrderAmount(order, CATALOG);
    collectOrderCategories(order, CATALOG);

    expect(JSON.stringify(order)).toBe(snapshot);
    expect(JSON.stringify([...CATALOG.entries()])).toBe(catalogSnapshot);
  });
});

describe('collectOrderCategories', () => {
  it('déduplique les catégories partagées par plusieurs produits', () => {
    const categories = collectOrderCategories(
      makeOrder([
        { productId: 'P001', quantity: 1 },
        { productId: 'P003', quantity: 1 },
      ]),
      CATALOG,
    );

    // « Électronique » est portée par les deux produits mais n'apparaît qu'une fois.
    expect(categories).toEqual(['Électronique', 'High-Tech', 'Audio']);
  });

  it('conserve l\'ordre de première apparition, items puis catégories produit', () => {
    const categories = collectOrderCategories(
      makeOrder([
        { productId: 'P005', quantity: 1 },
        { productId: 'P001', quantity: 1 },
      ]),
      CATALOG,
    );

    expect(categories).toEqual(['Alimentaire', 'Gourmandise', 'Électronique', 'High-Tech']);
  });

  it('conserve les catégories des produits connus malgré une référence inconnue', () => {
    const categories = collectOrderCategories(
      makeOrder([
        { productId: 'P999', quantity: 1 },
        { productId: 'P004', quantity: 1 },
      ]),
      CATALOG,
    );

    expect(categories).toEqual(['Alimentaire']);
  });

  it('retourne une liste vide si aucun produit n\'est connu', () => {
    expect(collectOrderCategories(makeOrder([{ productId: 'P999', quantity: 1 }]), CATALOG)).toEqual(
      [],
    );
  });
});
