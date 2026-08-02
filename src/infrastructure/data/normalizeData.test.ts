import { describe, expect, it } from 'vitest';

import { DuplicateIdError, InvalidDataError } from '../../domain/errors';
import type { DataIssue } from './dataIssues';
import { buildDataset, loadData } from './loadData';
import { normalizeProducts } from './normalizeData';

/** Signature compacte d'une anomalie, pour des assertions lisibles. */
const signature = (issue: DataIssue): string => `${issue.code}|${issue.entityId}`;

// --- Fixtures synthétiques minimales -----------------------------------------

const VALID_CUSTOMER = {
  id: 'C001',
  name: 'Sophie Martin',
  email: 'sophie@example.com',
  type: 'Standard',
  registration_date: '2024-01-15',
};

const VALID_PRODUCT = {
  id: 'P001',
  name: 'Café Bio',
  price: 12.5,
  categories: ['Alimentaire'],
};

const VALID_ORDER = {
  order_id: 'ORD-1',
  customer_id: 'C001',
  order_date: '2024-02-01T10:00:00Z',
  status: 'Delivered',
  express_delivery: false,
  items: [{ product_id: 'P001', quantity: 2 }],
};

function files(overrides: {
  customers?: unknown[];
  products?: unknown[];
  orders?: unknown[];
} = {}) {
  return {
    customers: { customers: overrides.customers ?? [VALID_CUSTOMER] },
    products: { products: overrides.products ?? [VALID_PRODUCT] },
    orders: { orders: overrides.orders ?? [VALID_ORDER] },
  };
}

// --- Accès typés au dataset fourni -------------------------------------------

function customer(id: string) {
  const found = loadData().indexes.customersById.get(id);
  if (!found) throw new Error(`Client ${id} absent du dataset`);
  return found;
}

function product(id: string) {
  const found = loadData().indexes.productsById.get(id);
  if (!found) throw new Error(`Produit ${id} absent du dataset`);
  return found;
}

function order(id: string) {
  const found = loadData().indexes.ordersById.get(id);
  if (!found) throw new Error(`Commande ${id} absente du dataset`);
  return found;
}

// -----------------------------------------------------------------------------

describe('dataset fourni — rapport d\'anomalies', () => {
  it('produit exactement 7 DataIssue, dans l\'ordre du pipeline', () => {
    expect(loadData().issues.map(signature)).toEqual([
      'CUSTOMER_TYPE_NORMALIZED|C007',
      'CUSTOMER_TYPE_MISSING|C009',
      'CUSTOMER_TYPE_MISSING|C012',
      'PRODUCT_PRICE_COERCED|P018',
      'ORDER_EXPRESS_DEFAULTED|ORD-2024-078',
      'UNKNOWN_CUSTOMER_REFERENCE|ORD-2024-077',
      'UNKNOWN_PRODUCT_REFERENCE|ORD-2024-079',
    ]);
  });

  it('classe les références inconnues en error et les normalisations en warning', () => {
    const bySeverity = (severity: string) =>
      loadData()
        .issues.filter((issue) => issue.severity === severity)
        .map((issue) => issue.code);

    expect(bySeverity('error')).toEqual([
      'UNKNOWN_CUSTOMER_REFERENCE',
      'UNKNOWN_PRODUCT_REFERENCE',
    ]);
    expect(bySeverity('warning')).toHaveLength(5);
  });

  it('conserve la valeur source de chaque anomalie', () => {
    const byEntityId = new Map(loadData().issues.map((issue) => [issue.entityId, issue]));

    expect(byEntityId.get('C007')?.rawValue).toBe('premium');
    expect(byEntityId.get('P018')?.rawValue).toBe('69.99');
    expect(byEntityId.get('ORD-2024-077')?.rawValue).toBe('C999');
    expect(byEntityId.get('ORD-2024-079')?.rawValue).toBe('P999');
  });

  it('distingue un type client absent (C009) d\'un type vide (C012)', () => {
    const byEntityId = new Map(loadData().issues.map((issue) => [issue.entityId, issue]));

    // Même code, mais la valeur source reste discernable.
    expect(byEntityId.get('C009')?.rawValue).toBeUndefined();
    expect(byEntityId.get('C009')?.message).toMatch(/absent/);
    expect(byEntityId.get('C012')?.rawValue).toBe('');
    expect(byEntityId.get('C012')?.message).toMatch(/vide/);
  });

  it('charge l\'intégralité des entités malgré les anomalies', () => {
    const { dataset } = loadData();
    expect(dataset.customers).toHaveLength(12);
    expect(dataset.products).toHaveLength(25);
    expect(dataset.orders).toHaveLength(80);
  });
});

describe('normalisation des types client', () => {
  it('normalise "premium" en "Premium" (C007)', () => {
    expect(customer('C007').type).toBe('Premium');
  });

  it('remplace un type absent par "Unknown" (C009)', () => {
    expect(customer('C009').type).toBe('Unknown');
  });

  it('remplace un type vide par "Unknown" (C012)', () => {
    expect(customer('C012').type).toBe('Unknown');
  });

  it('laisse intacts les types déjà canoniques et ne signale rien', () => {
    expect(customer('C001').type).toBe('Premium');
    expect(customer('C002').type).toBe('VIP');
    expect(customer('C003').type).toBe('Standard');

    const signalés = loadData()
      .issues.filter((issue) => issue.entity === 'customer')
      .map((issue) => issue.entityId);
    expect(signalés).toEqual(['C007', 'C009', 'C012']);
  });

  it('normalise les espaces superflus autour d\'un type reconnu', () => {
    const { dataset, issues } = buildDataset(
      files({ customers: [{ ...VALID_CUSTOMER, type: '  Premium  ' }] }),
    );

    expect(dataset.customers[0]?.type).toBe('Premium');
    expect(issues.map(signature)).toEqual(['CUSTOMER_TYPE_NORMALIZED|C001']);
  });

  it('bascule un type hors référentiel vers "Unknown" sans le confondre avec un type absent', () => {
    const { dataset, issues } = buildDataset(
      files({ customers: [{ ...VALID_CUSTOMER, type: 'Gold' }] }),
    );

    expect(dataset.customers[0]?.type).toBe('Unknown');
    expect(issues.map(signature)).toEqual(['CUSTOMER_TYPE_UNRECOGNIZED|C001']);
    expect(issues[0]?.rawValue).toBe('Gold');
  });
});

describe('normalisation des prix produit', () => {
  it('convertit le prix en chaîne de P018 en nombre', () => {
    expect(product('P018').price).toBe(69.99);
    expect(typeof product('P018').price).toBe('number');
  });

  it('ne signale rien pour un prix déjà numérique', () => {
    expect(product('P001').price).toBe(799.99);
    const signalés = loadData().issues.filter((issue) => issue.entity === 'product');
    expect(signalés.map((issue) => issue.entityId)).toEqual(['P018']);
  });

  it('refuse un prix non convertible passé outre la validation', () => {
    expect(() =>
      normalizeProducts([{ ...VALID_PRODUCT, price: 'gratuit' }]),
    ).toThrow(InvalidDataError);
  });
});

describe('normalisation des commandes', () => {
  it('remplace une livraison express absente par false (ORD-2024-078)', () => {
    expect(order('ORD-2024-078').expressDelivery).toBe(false);
  });

  it('préserve une livraison express explicitement renseignée', () => {
    expect(order('ORD-2024-003').expressDelivery).toBe(true);
    expect(order('ORD-2024-001').expressDelivery).toBe(false);

    const signalés = loadData()
      .issues.filter((issue) => issue.code === 'ORDER_EXPRESS_DEFAULTED')
      .map((issue) => issue.entityId);
    expect(signalés).toEqual(['ORD-2024-078']);
  });

  it('parse les dates de commande en UTC', () => {
    expect(order('ORD-2024-001').orderDate.toISOString()).toBe('2024-06-15T10:30:00.000Z');
  });
});

describe('références inconnues', () => {
  it('conserve la référence client C999 dans la commande ORD-2024-077', () => {
    expect(order('ORD-2024-077').customerId).toBe('C999');
    expect(loadData().indexes.customersById.has('C999')).toBe(false);
  });

  it('conserve la référence produit P999 dans la commande ORD-2024-079', () => {
    const items = order('ORD-2024-079').items.map((item) => item.productId);
    expect(items).toEqual(['P999', 'P007']);
    expect(loadData().indexes.productsById.has('P999')).toBe(false);
  });

  it('localise précisément la ligne fautive', () => {
    const issue = loadData().issues.find((i) => i.code === 'UNKNOWN_PRODUCT_REFERENCE');
    expect(issue?.field).toBe('items[0].productId');
  });

  it('n\'interrompt pas le chargement', () => {
    expect(() => loadData()).not.toThrow();
  });
});

describe('ORD-2024-080 — commande valide sur la borne temporelle', () => {
  it('ne produit aucune anomalie', () => {
    expect(loadData().issues.filter((issue) => issue.entityId === 'ORD-2024-080')).toEqual([]);
  });

  it('est chargée intégralement et datée sur la borne basse de la fenêtre', () => {
    const borne = order('ORD-2024-080');
    expect(borne.customerId).toBe('C003');
    expect(borne.orderDate.toISOString()).toBe('2024-05-15T10:00:00.000Z');
    expect(borne.expressDelivery).toBe(false);
    expect(borne.items).toEqual([{ productId: 'P004', quantity: 3 }]);
  });
});

describe('structures réellement invalides', () => {
  it('rejette un champ obligatoire manquant', () => {
    expect(() => buildDataset(files({ customers: [{ id: 'C001', name: 'Sophie' }] }))).toThrow(
      InvalidDataError,
    );
  });

  it('rejette un prix non numérique', () => {
    expect(() => buildDataset(files({ products: [{ ...VALID_PRODUCT, price: 'gratuit' }] }))).toThrow(
      InvalidDataError,
    );
  });

  it('rejette un prix négatif, en nombre comme en chaîne', () => {
    // Un prix négatif n'est pas une anomalie rattrapable : il fausserait
    // silencieusement tous les montants calculés en aval.
    expect(() => buildDataset(files({ products: [{ ...VALID_PRODUCT, price: -5 }] }))).toThrow(
      InvalidDataError,
    );
    expect(() => buildDataset(files({ products: [{ ...VALID_PRODUCT, price: '-5' }] }))).toThrow(
      InvalidDataError,
    );
    // Le prix nul reste accepté : il est plausible (article offert).
    expect(() => buildDataset(files({ products: [{ ...VALID_PRODUCT, price: 0 }] }))).not.toThrow();
  });

  it('rejette une date de commande illisible', () => {
    expect(() =>
      buildDataset(files({ orders: [{ ...VALID_ORDER, order_date: '15/06/2024' }] })),
    ).toThrow(InvalidDataError);
  });

  it('rejette une quantité nulle ou négative', () => {
    expect(() =>
      buildDataset(files({ orders: [{ ...VALID_ORDER, items: [{ product_id: 'P001', quantity: 0 }] }] })),
    ).toThrow(InvalidDataError);
  });

  it('nomme le fichier et le champ fautifs', () => {
    expect(() => buildDataset(files({ products: [{ ...VALID_PRODUCT, price: 'gratuit' }] }))).toThrow(
      /products\.json[\s\S]*price/,
    );
  });
});

describe('identifiants dupliqués', () => {
  it('rejette deux clients partageant un identifiant', () => {
    expect(() => buildDataset(files({ customers: [VALID_CUSTOMER, VALID_CUSTOMER] }))).toThrow(
      DuplicateIdError,
    );
  });

  it('rejette deux produits partageant un identifiant', () => {
    expect(() => buildDataset(files({ products: [VALID_PRODUCT, VALID_PRODUCT] }))).toThrow(
      DuplicateIdError,
    );
  });

  it('rejette deux commandes partageant un identifiant', () => {
    expect(() => buildDataset(files({ orders: [VALID_ORDER, VALID_ORDER] }))).toThrow(
      DuplicateIdError,
    );
  });

  it('ne résout jamais le doublon silencieusement', () => {
    expect(() => buildDataset(files({ customers: [VALID_CUSTOMER, VALID_CUSTOMER] }))).toThrow(
      /Résolution ambiguë/,
    );
  });
});
