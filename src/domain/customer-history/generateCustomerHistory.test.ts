import { describe, expect, it } from 'vitest';

// Le domaine n'importe jamais l'infrastructure ; les tests, si : ils vérifient
// le comportement sur les données réelles du test technique.
import { loadData } from '../../infrastructure/data/loadData';
import { UnknownCustomerError } from '../errors';
import type { Customer, Order, Product } from '../model';
import { generateCustomerHistory } from './generateCustomerHistory';
import type { CustomerHistoryReport, HistoryOrder, HistoryPeriod } from './types';

const { dataset, indexes } = loadData();

/** Commande la plus récente du dataset : ORD-2024-036. */
const DATASET_REFERENCE = new Date('2024-11-15T14:00:00Z');

function realReport(customerId: string, referenceDate?: Date): CustomerHistoryReport {
  return generateCustomerHistory({
    customerId,
    customersById: indexes.customersById,
    productsById: indexes.productsById,
    orders: dataset.orders,
    ...(referenceDate === undefined ? {} : { referenceDate }),
  });
}

const allOrders = (report: CustomerHistoryReport): HistoryOrder[] =>
  report.periods.flatMap((period) => period.orders);

function periodByKey(report: CustomerHistoryReport, key: string): HistoryPeriod {
  const found = report.periods.find((period) => period.key === key);
  if (!found) throw new Error(`Période ${key} absente du rapport`);
  return found;
}

function orderById(report: CustomerHistoryReport, orderId: string): HistoryOrder {
  const found = allOrders(report).find((order) => order.orderId === orderId);
  if (!found) throw new Error(`Commande ${orderId} absente du rapport`);
  return found;
}

// --- Fixtures synthétiques ----------------------------------------------------

const SYNTHETIC_CUSTOMER: Customer = {
  id: 'CX',
  name: 'Client Test',
  email: 'test@example.com',
  type: 'Standard',
  registrationDate: new Date('2024-01-01T00:00:00Z'),
};

const SYNTHETIC_CUSTOMERS = new Map<string, Customer>([['CX', SYNTHETIC_CUSTOMER]]);

function syntheticProducts(prices: Record<string, number>): ReadonlyMap<string, Product> {
  return new Map(
    Object.entries(prices).map(([id, price]) => [
      id,
      { id, name: `Produit ${id}`, price, categories: ['Alimentaire'] },
    ]),
  );
}

function syntheticOrder(
  id: string,
  isoDate: string,
  items: Array<[string, number]>,
  status = 'Delivered',
): Order {
  return {
    id,
    customerId: 'CX',
    orderDate: new Date(isoDate),
    status,
    expressDelivery: false,
    items: items.map(([productId, quantity]) => ({ productId, quantity })),
  };
}

function syntheticReport(
  orders: readonly Order[],
  prices: Record<string, number>,
  anomalyThresholdPercent?: number,
): CustomerHistoryReport {
  return generateCustomerHistory({
    customerId: 'CX',
    customersById: SYNTHETIC_CUSTOMERS,
    productsById: syntheticProducts(prices),
    orders,
    referenceDate: DATASET_REFERENCE,
    ...(anomalyThresholdPercent === undefined ? {} : { anomalyThresholdPercent }),
  });
}

// -----------------------------------------------------------------------------

describe('C001 — client régulier, regroupement hebdomadaire', () => {
  const report = realReport('C001');

  it('compte 20 commandes dans la fenêtre et classe le client comme régulier', () => {
    expect(allOrders(report)).toHaveLength(20);
    expect(report.rhythm.kind).toBe('regular');
    expect(report.rhythm.grouping).toBe('week');
    expect(report.rhythm.averageOrdersPerMonth).toBe(3.33); // 20 / 6
  });

  it('découpe la fenêtre en 27 semaines ISO', () => {
    expect(report.periods).toHaveLength(27);
    expect(report.periods[0]?.key).toBe('2024-W20');
    expect(report.periods[26]?.key).toBe('2024-W46');
  });

  it('expose le client normalisé', () => {
    expect(report.customer).toEqual({ id: 'C001', name: 'Sophie Martin', type: 'Premium' });
  });

  it('conserve tous les statuts sans filtrage', () => {
    expect(new Set(allOrders(report).map((order) => order.status))).toEqual(
      new Set(['Delivered', 'Processing', 'Shipped']),
    );
  });

  it('déduplique les catégories en conservant leur ordre d\'apparition', () => {
    // ORD-2024-001 : P001 [Électronique, High-Tech] puis P003 [Électronique, Audio].
    expect(orderById(report, 'ORD-2024-001').categories).toEqual([
      'Électronique',
      'High-Tech',
      'Audio',
    ]);
  });

  it('calcule le montant brut de chaque commande', () => {
    // 799,99 × 1 + 89,99 × 2
    expect(orderById(report, 'ORD-2024-001').amount).toBe(979.97);
  });
});

describe('C003 — la borne basse de la fenêtre est inclusive', () => {
  const report = realReport('C003');

  it('inclut ORD-2024-080, datée du 15 mai à 10:00 UTC', () => {
    const borderline = orderById(report, 'ORD-2024-080');

    expect(borderline.orderDate.toISOString()).toBe('2024-05-15T10:00:00.000Z');
    expect(borderline.amount).toBe(37.5); // P004 × 3 à 12,50 €
    expect(periodByKey(report, '2024-W20').orderCount).toBe(1);
  });

  it('compte 14 commandes et reste un client régulier', () => {
    expect(allOrders(report)).toHaveLength(14);
    expect(report.rhythm.kind).toBe('regular');
    expect(report.rhythm.averageOrdersPerMonth).toBe(2.33); // 14 / 6
  });
});

describe('C002 — client occasionnel, regroupement mensuel', () => {
  const report = realReport('C002');

  it('classe le client comme occasionnel et regroupe par mois', () => {
    expect(allOrders(report)).toHaveLength(3);
    expect(report.rhythm.kind).toBe('occasional');
    expect(report.rhythm.grouping).toBe('month');
    expect(report.rhythm.averageOrdersPerMonth).toBe(0.5);
  });

  it('génère les 7 mois de la fenêtre, y compris ceux sans commande', () => {
    expect(report.periods.map((period) => period.key)).toEqual([
      '2024-05',
      '2024-06',
      '2024-07',
      '2024-08',
      '2024-09',
      '2024-10',
      '2024-11',
    ]);
  });

  it('détecte les commandes s\'écartant de plus de 50 % de la moyenne', () => {
    expect(report.customerAverageAmount).toBe(1385.33);

    // 2847 € (+105 %) et 349 € (−74,8 %) dévient ; 959,98 € (−30,7 %) non.
    const anomalies = allOrders(report)
      .filter((order) => order.anomaly?.isAnomaly)
      .map((order) => order.orderId);
    expect(anomalies).toEqual(['ORD-2024-021', 'ORD-2024-023']);
  });
});

describe('C005 — rapport partiel malgré une référence produit inconnue', () => {
  const report = realReport('C005');

  it('produit tout de même le rapport', () => {
    expect(allOrders(report)).toHaveLength(4);
    expect(report.rhythm.kind).toBe('occasional');
  });

  it('rend ORD-2024-079 non chiffrable et expose P999', () => {
    const partial = orderById(report, 'ORD-2024-079');

    expect(partial.amount).toBeNull();
    expect(partial.missingProductIds).toEqual(['P999']);
    expect(partial.anomaly).toBeNull();
  });

  it('conserve les catégories des produits connus de la commande fautive', () => {
    // P999 est inconnu, mais P007 apporte ses trois catégories.
    expect(orderById(report, 'ORD-2024-079').categories).toEqual([
      'Électronique',
      'Informatique',
      'Accessoires',
    ]);
  });

  it('exclut le montant incalculable de la moyenne client', () => {
    // (89,99 + 69,99 + 69,98) / 3 — la quatrième commande ne compte pas.
    expect(report.customerAverageAmount).toBe(76.65);
  });

  it('marque la période concernée comme partielle', () => {
    const november = periodByKey(report, '2024-11');

    expect(november.orderCount).toBe(1);
    expect(november.pricedOrderCount).toBe(0);
    expect(november.isPartial).toBe(true);
    expect(november.totalAmount).toBe(0);
    expect(november.averageAmount).toBeNull();
  });
});

describe('client inconnu et commandes orphelines', () => {
  it('lève UnknownCustomerError pour C999', () => {
    expect(() => realReport('C999')).toThrow(UnknownCustomerError);
    expect(() => realReport('C999')).toThrow(/C999/);
  });

  it('ne rattache ORD-2024-077 à aucun client valide', () => {
    const attached = dataset.customers
      .flatMap((customer) => allOrders(realReport(customer.id)))
      .map((order) => order.orderId);

    expect(attached).not.toContain('ORD-2024-077');
  });
});

describe('date de référence', () => {
  it('utilise par défaut la commande la plus récente de tout le dataset', () => {
    // ORD-2024-036 (client C003) fixe la fenêtre, y compris pour C002.
    const report = realReport('C002');

    expect(report.window.start.toISOString()).toBe('2024-05-15T00:00:00.000Z');
    expect(report.window.end.toISOString()).toBe('2024-11-15T23:59:59.999Z');
  });

  it('n\'utilise pas la dernière commande du seul client demandé', () => {
    // La dernière commande de C005 date du 10 novembre : une fenêtre locale
    // démarrerait le 10 mai, pas le 15.
    expect(realReport('C005').window.start.toISOString()).toBe('2024-05-15T00:00:00.000Z');
  });

  it('accepte une date de référence injectée', () => {
    const report = realReport('C001', new Date('2024-08-31T12:00:00Z'));

    expect(report.window.start.toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(report.window.end.toISOString()).toBe('2024-08-31T23:59:59.999Z');
    expect(allOrders(report).length).toBeLessThan(20);
  });

  it('rejette explicitement un dataset vide sans date de référence', () => {
    expect(() =>
      generateCustomerHistory({
        customerId: 'CX',
        customersById: SYNTHETIC_CUSTOMERS,
        productsById: syntheticProducts({ PA: 100 }),
        orders: [],
      }),
    ).toThrow(RangeError);
  });
});

describe('rythme d\'achat', () => {
  it('compte toutes les commandes, y compris celles dont le montant est incalculable', () => {
    // 12 commandes chiffrables + 1 non chiffrable = 13 → 2,17/mois → régulier.
    // Sans la commande non chiffrable : 12 → exactement 2/mois → occasionnel.
    const orders = [
      ...Array.from({ length: 12 }, (_, index) =>
        syntheticOrder(`O${index}`, `2024-06-${String(index + 1).padStart(2, '0')}T10:00:00Z`, [
          ['PA', 1],
        ]),
      ),
      syntheticOrder('O-MISSING', '2024-07-01T10:00:00Z', [['PX', 1]]),
    ];

    const report = syntheticReport(orders, { PA: 100 });

    expect(allOrders(report)).toHaveLength(13);
    expect(report.rhythm.kind).toBe('regular');
    expect(report.rhythm.grouping).toBe('week');
    expect(report.rhythm.averageOrdersPerMonth).toBe(2.17);
  });

  it('reste occasionnel à exactement 2 commandes par mois', () => {
    const orders = Array.from({ length: 12 }, (_, index) =>
      syntheticOrder(`O${index}`, `2024-06-${String(index + 1).padStart(2, '0')}T10:00:00Z`, [
        ['PA', 1],
      ]),
    );

    const report = syntheticReport(orders, { PA: 100 });

    expect(report.rhythm.averageOrdersPerMonth).toBe(2);
    expect(report.rhythm.kind).toBe('occasional');
    expect(report.rhythm.grouping).toBe('month');
  });

  it('exclut les montants nuls de la moyenne client', () => {
    const report = syntheticReport(
      [
        syntheticOrder('O1', '2024-06-10T10:00:00Z', [['PA', 1]]),
        syntheticOrder('O2', '2024-07-10T10:00:00Z', [['PB', 1]]),
        syntheticOrder('O3', '2024-08-10T10:00:00Z', [['PX', 1]]),
      ],
      { PA: 100, PB: 200 },
    );

    expect(report.customerAverageAmount).toBe(150); // (100 + 200) / 2
  });
});

describe('seuil d\'anomalie', () => {
  it('ne signale pas une commande à exactement 50 % d\'écart', () => {
    // Moyenne 100 ; écarts de 50 € soit exactement 50 %.
    const report = syntheticReport(
      [
        syntheticOrder('O1', '2024-06-10T10:00:00Z', [['PA', 1]]),
        syntheticOrder('O2', '2024-07-10T10:00:00Z', [['PB', 1]]),
      ],
      { PA: 50, PB: 150 },
    );

    expect(report.customerAverageAmount).toBe(100);
    expect(allOrders(report).map((order) => order.anomaly)).toEqual([
      { deviationPercent: 50, isAnomaly: false },
      { deviationPercent: 50, isAnomaly: false },
    ]);
  });

  it('signale un écart strictement supérieur à 50 %', () => {
    const report = syntheticReport(
      [
        syntheticOrder('O1', '2024-06-10T10:00:00Z', [['PA', 1]]),
        syntheticOrder('O2', '2024-07-10T10:00:00Z', [['PB', 1]]),
      ],
      { PA: 40, PB: 160 },
    );

    expect(report.customerAverageAmount).toBe(100);
    expect(allOrders(report).map((order) => order.anomaly?.isAnomaly)).toEqual([true, true]);
    expect(allOrders(report)[0]?.anomaly?.deviationPercent).toBe(60);
  });

  it('accepte un seuil configurable', () => {
    const orders = [
      syntheticOrder('O1', '2024-06-10T10:00:00Z', [['PA', 1]]),
      syntheticOrder('O2', '2024-07-10T10:00:00Z', [['PB', 1]]),
    ];

    expect(syntheticReport(orders, { PA: 50, PB: 150 }, 40).periods.flatMap((p) => p.orders)[0]?.anomaly?.isAnomaly).toBe(true);
    expect(syntheticReport(orders, { PA: 50, PB: 150 }, 60).periods.flatMap((p) => p.orders)[0]?.anomaly?.isAnomaly).toBe(false);
  });

  it('renvoie une anomalie nulle lorsque la moyenne du client est nulle', () => {
    const report = syntheticReport(
      [syntheticOrder('O1', '2024-06-10T10:00:00Z', [['PA', 1]])],
      { PA: 0 },
    );

    expect(report.customerAverageAmount).toBe(0);
    expect(allOrders(report)[0]?.anomaly).toBeNull();
  });
});

describe('évolution entre périodes', () => {
  it('est nulle pour la première période', () => {
    const report = syntheticReport([syntheticOrder('O1', '2024-06-10T10:00:00Z', [['PA', 1]])], {
      PA: 100,
    });

    expect(report.periods[0]?.evolutionPercent).toBeNull();
  });

  it('se calcule entre deux périodes complètes consécutives', () => {
    const report = syntheticReport(
      [
        syntheticOrder('O1', '2024-06-10T10:00:00Z', [['PA', 1]]),
        syntheticOrder('O2', '2024-07-10T10:00:00Z', [['PB', 1]]),
      ],
      { PA: 100, PB: 150 },
    );

    expect(periodByKey(report, '2024-07').evolutionPercent).toBe(50); // 100 → 150
  });

  it('est nulle lorsque le total de la période précédente vaut 0', () => {
    const report = syntheticReport(
      [
        syntheticOrder('O1', '2024-06-10T10:00:00Z', [['PA', 1]]),
        syntheticOrder('O2', '2024-08-10T10:00:00Z', [['PA', 1]]),
      ],
      { PA: 100 },
    );

    // Juillet est vide : comparer août à un total nul n'aurait pas de sens.
    expect(periodByKey(report, '2024-07').totalAmount).toBe(0);
    expect(periodByKey(report, '2024-08').evolutionPercent).toBeNull();
  });

  it('est nulle lorsque la période courante est partielle', () => {
    const report = syntheticReport(
      [
        syntheticOrder('O1', '2024-06-10T10:00:00Z', [['PA', 1]]),
        syntheticOrder('O2', '2024-07-10T10:00:00Z', [['PA', 1]]),
        syntheticOrder('O3', '2024-07-20T10:00:00Z', [['PX', 1]]),
      ],
      { PA: 100 },
    );

    expect(periodByKey(report, '2024-07').isPartial).toBe(true);
    expect(periodByKey(report, '2024-07').evolutionPercent).toBeNull();
  });

  it('est nulle lorsque la période précédente est partielle', () => {
    const report = syntheticReport(
      [
        syntheticOrder('O1', '2024-06-10T10:00:00Z', [['PA', 1]]),
        syntheticOrder('O2', '2024-06-20T10:00:00Z', [['PX', 1]]),
        syntheticOrder('O3', '2024-07-10T10:00:00Z', [['PA', 1]]),
      ],
      { PA: 100 },
    );

    expect(periodByKey(report, '2024-06').isPartial).toBe(true);
    expect(periodByKey(report, '2024-07').evolutionPercent).toBeNull();
  });
});

describe('périodes sans commande', () => {
  it('reste présente avec des agrégats neutres', () => {
    const report = syntheticReport([syntheticOrder('O1', '2024-06-10T10:00:00Z', [['PA', 1]])], {
      PA: 100,
    });
    const empty = periodByKey(report, '2024-09');

    expect(empty.orderCount).toBe(0);
    expect(empty.pricedOrderCount).toBe(0);
    expect(empty.totalAmount).toBe(0);
    expect(empty.averageAmount).toBeNull();
    expect(empty.isPartial).toBe(false);
    expect(empty.orders).toEqual([]);
  });

  it('conserve toutes les périodes de la fenêtre pour un client à commande unique', () => {
    expect(realReport('C009').periods).toHaveLength(7);
    expect(allOrders(realReport('C009'))).toHaveLength(1);
  });
});

describe('pureté', () => {
  it('ne mute ni les commandes, ni les index reçus', () => {
    const orders = [...dataset.orders];
    const ordersSnapshot = JSON.stringify(orders);
    const customersSnapshot = JSON.stringify([...indexes.customersById.entries()]);
    const productsSnapshot = JSON.stringify([...indexes.productsById.entries()]);

    realReport('C001');
    realReport('C005');

    expect(JSON.stringify(orders)).toBe(ordersSnapshot);
    expect(JSON.stringify([...indexes.customersById.entries()])).toBe(customersSnapshot);
    expect(JSON.stringify([...indexes.productsById.entries()])).toBe(productsSnapshot);
  });

  it('ne partage pas ses Date avec les commandes sources', () => {
    const report = realReport('C001');
    const source = indexes.ordersById.get('ORD-2024-001');

    expect(orderById(report, 'ORD-2024-001').orderDate).not.toBe(source?.orderDate);
    expect(orderById(report, 'ORD-2024-001').orderDate.getTime()).toBe(source?.orderDate.getTime());
  });
});
