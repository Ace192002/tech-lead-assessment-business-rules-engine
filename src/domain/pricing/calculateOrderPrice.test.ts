import { describe, expect, it } from 'vitest';

// Le domaine n'importe jamais l'infrastructure ; les tests, si.
import { loadData } from '../../infrastructure/data/loadData';
import { calculateGrossOrderAmount } from '../calculateGrossOrderAmount';
import { UnknownCustomerError, UnknownOrderError, UnknownProductError } from '../errors';
import type { Customer, CustomerType, Order, Product } from '../model';
import type { CalculateOrderPriceInput } from './calculateOrderPrice';
import { calculateOrderPrice } from './calculateOrderPrice';
import {
  CONDITIONAL_TIER_1000_RULE_ID,
  CONDITIONAL_TIER_500_RULE_ID,
  CUMULATIVE_VOLUME_RULE_ID,
  ELECTRONICS_TAX_RULE_ID,
  FIRST_ORDER_OF_MONTH_RULE_ID,
  FOOD_TAX_RULE_ID,
  PREMIUM_RULE_ID,
  PRICING_RULES,
  PROCESSING_FEE_RULE_ID,
  VIP_RULE_ID,
  EXPRESS_DELIVERY_RULE_ID,
} from './rules';
import type { OrderPricingResult, RuleFamily, RuleTraceEntry } from './types';

const { dataset, indexes } = loadData();

function realPrice(orderId: string): OrderPricingResult {
  return calculateOrderPrice({
    orderId,
    orders: dataset.orders,
    customersById: indexes.customersById,
    productsById: indexes.productsById,
  });
}

function entry(result: OrderPricingResult, ruleId: string): RuleTraceEntry {
  const found = result.trace.find((traceEntry) => traceEntry.ruleId === ruleId);
  if (!found) throw new Error(`Règle ${ruleId} absente de la trace`);
  return found;
}

// --- Fixtures synthétiques ----------------------------------------------------

interface SyntheticItem {
  readonly productId: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly categories: string[];
}

interface SyntheticOptions {
  readonly items: readonly SyntheticItem[];
  readonly customerType?: CustomerType;
  readonly expressDelivery?: boolean;
  /** Par défaut `false` : une commande antérieure du même mois est ajoutée. */
  readonly firstOfMonth?: boolean;
}

const TARGET_ORDER_ID = 'ORD-SYNTH';

function syntheticInput(options: SyntheticOptions): CalculateOrderPriceInput {
  const {
    items,
    customerType = 'Standard',
    expressDelivery = false,
    firstOfMonth = false,
  } = options;

  const customer: Customer = {
    id: 'CX',
    name: 'Client Test',
    email: 'test@example.com',
    type: customerType,
    registrationDate: new Date('2024-01-01T00:00:00Z'),
  };

  const productsById = new Map<string, Product>(
    items.map((item) => [
      item.productId,
      { id: item.productId, name: item.productId, price: item.unitPrice, categories: item.categories },
    ]),
  );

  const target: Order = {
    id: TARGET_ORDER_ID,
    customerId: 'CX',
    orderDate: new Date('2024-06-15T10:00:00Z'),
    status: 'Delivered',
    expressDelivery,
    items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
  };

  const orders: Order[] = firstOfMonth
    ? [target]
    : [{ ...target, id: 'ORD-DECOY', orderDate: new Date('2024-06-01T10:00:00Z') }, target];

  return {
    orderId: TARGET_ORDER_ID,
    orders,
    customersById: new Map([['CX', customer]]),
    productsById,
  };
}

const price = (options: SyntheticOptions): OrderPricingResult =>
  calculateOrderPrice(syntheticInput(options));

/** Catégorie absente des règles de taxe, pour isoler les seuils testés. */
const NEUTRAL = ['Bureau'];

// -----------------------------------------------------------------------------

describe('ORD-2024-001 — Premium, première du mois, palier 500, taxe Électronique', () => {
  const result = realPrice('ORD-2024-001');

  it('aboutit à 955,18 € pour un prix de base de 979,97 €', () => {
    expect(result.basePrice).toBe(979.97);
    expect(result.finalPrice).toBe(955.18);
    expect(result.customerId).toBe('C001');
  });

  it('applique la remise Premium et ignore la remise VIP', () => {
    expect(entry(result, PREMIUM_RULE_ID)).toMatchObject({ outcome: 'applied', impact: -98 });
    expect(entry(result, VIP_RULE_ID).outcome).toBe('skipped');
    expect(entry(result, VIP_RULE_ID).reason).toMatch(/exclusive/);
  });

  it('applique la remise première commande du mois', () => {
    expect(entry(result, FIRST_ORDER_OF_MONTH_RULE_ID)).toMatchObject({
      outcome: 'applied',
      impact: -44.1,
    });
  });

  it('applique le palier 500 et non le palier 1000', () => {
    expect(entry(result, CONDITIONAL_TIER_1000_RULE_ID).outcome).toBe('skipped');
    expect(entry(result, CONDITIONAL_TIER_500_RULE_ID)).toMatchObject({
      outcome: 'applied',
      amountBefore: 837.87,
      amountAfter: 795.98,
    });
  });

  it('taxe les deux produits Électronique à 20 %', () => {
    expect(entry(result, ELECTRONICS_TAX_RULE_ID)).toMatchObject({
      outcome: 'applied',
      impact: 159.2,
    });
    expect(entry(result, ELECTRONICS_TAX_RULE_ID).reason).toContain('P001, P003');
  });

  it('n\'applique pas la remise de volume : 3 unités Électronique seulement', () => {
    expect(entry(result, CUMULATIVE_VOLUME_RULE_ID).outcome).toBe('skipped');
  });

  it('n\'ajoute ni livraison express ni frais de traitement', () => {
    expect(entry(result, EXPRESS_DELIVERY_RULE_ID).outcome).toBe('skipped');
    expect(entry(result, PROCESSING_FEE_RULE_ID).outcome).toBe('skipped');
    expect(result.adjustments).toEqual([]);
  });
});

describe('ORD-2024-021 — VIP, palier 1000 remplaçant le palier 500, express', () => {
  const result = realPrice('ORD-2024-021');

  it('aboutit à 2 553,04 € pour un prix de base de 2 847 €', () => {
    expect(result.basePrice).toBe(2847);
    expect(result.finalPrice).toBe(2553.04);
  });

  it('applique la remise VIP et ignore Premium', () => {
    expect(entry(result, VIP_RULE_ID)).toMatchObject({ outcome: 'applied', impact: -427.05 });
    expect(entry(result, PREMIUM_RULE_ID).outcome).toBe('skipped');
  });

  it('remplace le palier 500 par le palier 1000, sans cumul', () => {
    expect(entry(result, CONDITIONAL_TIER_1000_RULE_ID).outcome).toBe('applied');
    expect(entry(result, CONDITIONAL_TIER_500_RULE_ID)).toMatchObject({
      outcome: 'replaced',
      impact: 0,
    });
    expect(entry(result, CONDITIONAL_TIER_500_RULE_ID).reason).toMatch(/remplacée par le palier 1000/);
    expect(result.iterations).toBe(2);
  });

  it('ajoute la livraison express en ajustement de commande', () => {
    expect(entry(result, EXPRESS_DELIVERY_RULE_ID)).toMatchObject({ outcome: 'applied', impact: 15 });
    expect(result.adjustments).toEqual([
      { ruleId: EXPRESS_DELIVERY_RULE_ID, label: 'Livraison express', amount: 15 },
    ]);
  });
});

describe('ORD-2024-009 — Alimentaire, taxe 5,5 % puis remise de volume', () => {
  const result = realPrice('ORD-2024-009');

  it('aboutit à 129,27 € pour un prix de base de 151,27 €', () => {
    expect(result.basePrice).toBe(151.27);
    expect(result.finalPrice).toBe(129.27);
  });

  it('taxe les quatre produits Alimentaire à 5,5 %', () => {
    expect(entry(result, ELECTRONICS_TAX_RULE_ID).outcome).toBe('skipped');
    expect(entry(result, FOOD_TAX_RULE_ID).reason).toContain('P004, P015, P019, P021');
  });

  it('applique la remise de volume sur les 14 unités Alimentaire', () => {
    expect(entry(result, CUMULATIVE_VOLUME_RULE_ID)).toMatchObject({ outcome: 'applied' });
    expect(entry(result, CUMULATIVE_VOLUME_RULE_ID).reason).toContain('Alimentaire (14 u.)');
  });

  it('n\'annule pas un palier 500 qui n\'avait jamais été appliqué', () => {
    // Le total tombe bien sous 500 € après la remise de volume, mais le palier
    // n'était pas actif : il doit rester « ignoré », pas devenir « annulé ».
    expect(entry(result, CONDITIONAL_TIER_500_RULE_ID).outcome).toBe('skipped');
    expect(result.iterations).toBe(1);
  });

  it('n\'applique pas la remise première commande du mois', () => {
    // ORD-2024-007 précède, le 3 août.
    expect(entry(result, FIRST_ORDER_OF_MONTH_RULE_ID).outcome).toBe('skipped');
  });
});

describe('ORD-2024-065 — produit sans catégorie taxable', () => {
  const result = realPrice('ORD-2024-065');

  it('n\'applique aucune taxe à P024', () => {
    expect(entry(result, ELECTRONICS_TAX_RULE_ID).outcome).toBe('skipped');
    expect(entry(result, FOOD_TAX_RULE_ID).outcome).toBe('skipped');
    expect(result.lines[0]?.categories).toEqual(['Informatique', 'Accessoires']);
  });

  it('ajoute les frais de traitement et aboutit à 47,75 €', () => {
    // 45 € × 0,95 (première du mois) = 42,75 € < 50 € → +5 €.
    expect(result.basePrice).toBe(45);
    expect(entry(result, PROCESSING_FEE_RULE_ID)).toMatchObject({ outcome: 'applied', impact: 5 });
    expect(result.finalPrice).toBe(47.75);
  });
});

describe('références inconnues — aucun calcul partiel', () => {
  it('lève UnknownProductError sur ORD-2024-079 (P999)', () => {
    expect(() => realPrice('ORD-2024-079')).toThrow(UnknownProductError);
    expect(() => realPrice('ORD-2024-079')).toThrow(/P999/);
  });

  it('lève UnknownCustomerError sur ORD-2024-077 (C999)', () => {
    expect(() => realPrice('ORD-2024-077')).toThrow(UnknownCustomerError);
    expect(() => realPrice('ORD-2024-077')).toThrow(/C999/);
  });

  it('lève UnknownOrderError sur une commande inexistante', () => {
    expect(() => realPrice('ORD-INEXISTANTE')).toThrow(UnknownOrderError);
  });
});

describe('paliers conditionnels — seuils stricts sur l\'instantané après règles de base', () => {
  it('n\'applique pas le palier 500 à exactement 500 €', () => {
    const result = price({ items: [{ productId: 'P', unitPrice: 500, quantity: 1, categories: NEUTRAL }] });

    expect(entry(result, CONDITIONAL_TIER_500_RULE_ID).outcome).toBe('skipped');
    expect(result.finalPrice).toBe(500);
  });

  it('applique le palier 500 juste au-dessus du seuil', () => {
    const result = price({ items: [{ productId: 'P', unitPrice: 500.01, quantity: 1, categories: NEUTRAL }] });

    expect(entry(result, CONDITIONAL_TIER_500_RULE_ID).outcome).toBe('applied');
    expect(result.finalPrice).toBe(475.01);
  });

  it('reste sur le palier 500 à exactement 1000 €', () => {
    const result = price({ items: [{ productId: 'P', unitPrice: 1000, quantity: 1, categories: NEUTRAL }] });

    expect(entry(result, CONDITIONAL_TIER_1000_RULE_ID).outcome).toBe('skipped');
    expect(entry(result, CONDITIONAL_TIER_500_RULE_ID).outcome).toBe('applied');
    expect(result.finalPrice).toBe(950);
  });

  it('bascule sur le palier 1000 juste au-dessus du seuil', () => {
    const result = price({ items: [{ productId: 'P', unitPrice: 1000.01, quantity: 1, categories: NEUTRAL }] });

    expect(entry(result, CONDITIONAL_TIER_1000_RULE_ID).outcome).toBe('applied');
    expect(entry(result, CONDITIONAL_TIER_500_RULE_ID).outcome).toBe('replaced');
    expect(result.finalPrice).toBe(920.01); // 1000,01 × 0,92
  });

  it('ignore une taxe qui fait repasser le total au-dessus de 500 €', () => {
    // 450 € après règles de base : sous le seuil. La taxe de 20 % porte le total
    // à 540 €, mais le palier s'évalue sur l'instantané d'avant taxe.
    const result = price({
      items: [{ productId: 'P', unitPrice: 450, quantity: 1, categories: ['Électronique'] }],
    });

    expect(entry(result, CONDITIONAL_TIER_500_RULE_ID).outcome).toBe('skipped');
    expect(result.finalPrice).toBe(540);
  });
});

describe('taxes par catégorie', () => {
  it('n\'applique que le taux le plus élevé à un produit Électronique et Alimentaire', () => {
    const result = price({
      items: [
        { productId: 'P', unitPrice: 100, quantity: 1, categories: ['Électronique', 'Alimentaire'] },
      ],
    });

    expect(result.finalPrice).toBe(120); // et non 100 × 1,2 × 1,055
    expect(entry(result, FOOD_TAX_RULE_ID).outcome).toBe('skipped');
  });

  it('ne taxe pas un produit sans catégorie taxable', () => {
    const result = price({ items: [{ productId: 'P', unitPrice: 100, quantity: 1, categories: NEUTRAL }] });

    expect(entry(result, ELECTRONICS_TAX_RULE_ID).outcome).toBe('skipped');
    expect(entry(result, FOOD_TAX_RULE_ID).outcome).toBe('skipped');
    expect(result.finalPrice).toBe(100);
  });

  it('taxe chaque ligne selon ses propres catégories', () => {
    const result = price({
      items: [
        { productId: 'ELEC', unitPrice: 100, quantity: 1, categories: ['Électronique'] },
        { productId: 'FOOD', unitPrice: 100, quantity: 1, categories: ['Alimentaire'] },
        { productId: 'NEUTRE', unitPrice: 100, quantity: 1, categories: NEUTRAL },
      ],
    });

    expect(result.lines.map((line) => line.finalAmount)).toEqual([120, 105.5, 100]);
  });
});

describe('remise de volume par catégorie', () => {
  it('ne se déclenche pas à 3 unités', () => {
    const result = price({ items: [{ productId: 'P', unitPrice: 100, quantity: 3, categories: NEUTRAL }] });

    expect(entry(result, CUMULATIVE_VOLUME_RULE_ID).outcome).toBe('skipped');
    expect(result.finalPrice).toBe(300);
  });

  it('se déclenche à 4 unités', () => {
    const result = price({ items: [{ productId: 'P', unitPrice: 100, quantity: 4, categories: NEUTRAL }] });

    expect(entry(result, CUMULATIVE_VOLUME_RULE_ID).outcome).toBe('applied');
    expect(result.finalPrice).toBe(360);
  });

  it('cumule les quantités de plusieurs références d\'une même catégorie', () => {
    // Deux références seulement, mais 4 unités : le seuil porte sur les unités.
    const result = price({
      items: [
        { productId: 'A', unitPrice: 100, quantity: 2, categories: NEUTRAL },
        { productId: 'B', unitPrice: 100, quantity: 2, categories: NEUTRAL },
      ],
    });

    expect(entry(result, CUMULATIVE_VOLUME_RULE_ID).outcome).toBe('applied');
    expect(result.finalPrice).toBe(360);
  });

  it('ne remise qu\'une fois une ligne appartenant à deux catégories qualifiantes', () => {
    const result = price({
      items: [{ productId: 'P', unitPrice: 100, quantity: 4, categories: ['Bureau', 'Papeterie'] }],
    });

    expect(result.finalPrice).toBe(360); // × 0,90 une seule fois, pas × 0,81
    expect(entry(result, CUMULATIVE_VOLUME_RULE_ID).reason).toContain('Bureau (4 u.)');
    expect(entry(result, CUMULATIVE_VOLUME_RULE_ID).reason).toContain('Papeterie (4 u.)');
  });

  it('laisse inchangées les lignes non éligibles', () => {
    const result = price({
      items: [
        { productId: 'VOLUME', unitPrice: 100, quantity: 4, categories: ['Bureau'] },
        { productId: 'UNITE', unitPrice: 100, quantity: 1, categories: ['Papeterie'] },
      ],
    });

    expect(result.lines.map((line) => line.finalAmount)).toEqual([360, 100]);
  });
});

describe('annulation du palier 500 par la remise de volume', () => {
  // 520 € après règles de base ; palier 500 → 494 € ; remise de volume → 444,60 €,
  // sous le seuil : le palier n'aurait jamais dû s'appliquer.
  const result = price({ items: [{ productId: 'P', unitPrice: 130, quantity: 4, categories: NEUTRAL }] });

  it('aboutit à 468 €, ni 444,60 € ni 520 €', () => {
    expect(result.basePrice).toBe(520);
    expect(result.finalPrice).toBe(468); // 520 × 0,90, sans le −5 %
  });

  it('rejoue depuis l\'état brut plutôt que d\'inverser la remise', () => {
    expect(result.iterations).toBe(2);
    expect(entry(result, CONDITIONAL_TIER_500_RULE_ID)).toMatchObject({
      outcome: 'cancelled',
      amountBefore: 520,
      amountAfter: 520,
      impact: 0,
    });
    expect(entry(result, CONDITIONAL_TIER_500_RULE_ID).reason).toMatch(/sous le seuil de 500/);
  });

  it('conserve la remise de volume', () => {
    expect(entry(result, CUMULATIVE_VOLUME_RULE_ID)).toMatchObject({
      outcome: 'applied',
      amountBefore: 520,
      amountAfter: 468,
      impact: -52,
    });
  });
});

describe('règles finales', () => {
  it('n\'ajoute pas de frais quand l\'express fait passer 40 € à 55 €', () => {
    const result = price({
      items: [{ productId: 'P', unitPrice: 40, quantity: 1, categories: NEUTRAL }],
      expressDelivery: true,
    });

    expect(entry(result, PROCESSING_FEE_RULE_ID).outcome).toBe('skipped');
    expect(result.finalPrice).toBe(55);
  });

  it('ajoute les frais quand l\'express ne porte le total qu\'à 45 €', () => {
    const result = price({
      items: [{ productId: 'P', unitPrice: 30, quantity: 1, categories: NEUTRAL }],
      expressDelivery: true,
    });

    expect(result.finalPrice).toBe(50);
    expect(result.adjustments.map((adjustment) => adjustment.amount)).toEqual([15, 5]);
  });

  it('n\'ajoute pas de frais à exactement 50 €', () => {
    const result = price({ items: [{ productId: 'P', unitPrice: 50, quantity: 1, categories: NEUTRAL }] });

    expect(entry(result, PROCESSING_FEE_RULE_ID).outcome).toBe('skipped');
    expect(result.finalPrice).toBe(50);
  });
});

describe('première commande du mois', () => {
  function priceWithOrders(orders: readonly Order[], orderId: string): OrderPricingResult {
    const customer: Customer = {
      id: 'CX',
      name: 'Client Test',
      email: 'test@example.com',
      type: 'Standard',
      registrationDate: new Date('2024-01-01T00:00:00Z'),
    };
    return calculateOrderPrice({
      orderId,
      orders,
      customersById: new Map([['CX', customer]]),
      productsById: new Map([['P', { id: 'P', name: 'P', price: 100, categories: NEUTRAL }]]),
    });
  }

  const order = (id: string, isoDate: string): Order => ({
    id,
    customerId: 'CX',
    orderDate: new Date(isoDate),
    status: 'Delivered',
    expressDelivery: false,
    items: [{ productId: 'P', quantity: 1 }],
  });

  it('découpe les mois en UTC, pas en heure locale', () => {
    // Sous UTC+2, la commande du 30 juin 23:30 Z tomberait au 1er juillet local
    // et ferait perdre la remise à celle du 1er juillet 00:30 Z.
    const orders = [order('ORD-JUIN', '2024-06-30T23:30:00Z'), order('ORD-JUILLET', '2024-07-01T00:30:00Z')];
    const result = priceWithOrders(orders, 'ORD-JUILLET');

    expect(entry(result, FIRST_ORDER_OF_MONTH_RULE_ID).outcome).toBe('applied');
    expect(result.finalPrice).toBe(95);
  });

  it('départage deux commandes de même date par identifiant croissant', () => {
    const orders = [order('ORD-B', '2024-06-15T10:00:00Z'), order('ORD-A', '2024-06-15T10:00:00Z')];

    expect(entry(priceWithOrders(orders, 'ORD-A'), FIRST_ORDER_OF_MONTH_RULE_ID).outcome).toBe(
      'applied',
    );
    expect(entry(priceWithOrders(orders, 'ORD-B'), FIRST_ORDER_OF_MONTH_RULE_ID).outcome).toBe(
      'skipped',
    );
  });

  it('ne filtre aucun statut', () => {
    const orders = [
      { ...order('ORD-A', '2024-06-01T10:00:00Z'), status: 'Processing' },
      order('ORD-B', '2024-06-15T10:00:00Z'),
    ];

    // La commande « Processing » compte comme première du mois.
    expect(entry(priceWithOrders(orders, 'ORD-B'), FIRST_ORDER_OF_MONTH_RULE_ID).outcome).toBe(
      'skipped',
    );
  });
});

describe('précision et prix de base', () => {
  it('n\'arrondit pas l\'état interne entre les règles', () => {
    // 500,004 € franchit le seuil « > 500 € ». Arrondi à chaque étape, il
    // vaudrait 500,00 € et la remise ne s'appliquerait pas.
    const result = price({ items: [{ productId: 'P', unitPrice: 500.004, quantity: 1, categories: NEUTRAL }] });

    expect(entry(result, CONDITIONAL_TIER_500_RULE_ID).outcome).toBe('applied');
    expect(result.finalPrice).toBe(475);
  });

  it('expose un prix de base égal au montant brut de la commande', () => {
    for (const orderId of ['ORD-2024-001', 'ORD-2024-009', 'ORD-2024-021', 'ORD-2024-065']) {
      const order = indexes.ordersById.get(orderId);
      if (!order) throw new Error(`Commande ${orderId} absente`);

      expect(realPrice(orderId).basePrice).toBe(
        calculateGrossOrderAmount(order, indexes.productsById).amount,
      );
    }
  });
});

describe('registre de règles', () => {
  const FAMILY_ORDER: RuleFamily[] = ['base', 'conditional', 'category', 'cumulative', 'final'];

  it('déclare les dix règles de l\'énoncé, avec des identifiants uniques', () => {
    expect(PRICING_RULES.map((rule) => rule.id)).toEqual([
      PREMIUM_RULE_ID,
      VIP_RULE_ID,
      FIRST_ORDER_OF_MONTH_RULE_ID,
      CONDITIONAL_TIER_1000_RULE_ID,
      CONDITIONAL_TIER_500_RULE_ID,
      ELECTRONICS_TAX_RULE_ID,
      FOOD_TAX_RULE_ID,
      CUMULATIVE_VOLUME_RULE_ID,
      EXPRESS_DELIVERY_RULE_ID,
      PROCESSING_FEE_RULE_ID,
    ]);
    expect(new Set(PRICING_RULES.map((rule) => rule.id)).size).toBe(PRICING_RULES.length);
  });

  it('ordonne les priorités selon les cinq familles de l\'énoncé', () => {
    const priorities = PRICING_RULES.map((rule) => rule.priority);
    expect([...priorities].sort((left, right) => left - right)).toEqual(priorities);

    const families = PRICING_RULES.map((rule) => FAMILY_ORDER.indexOf(rule.family));
    expect(families).not.toContain(-1);
    expect([...families].sort((left, right) => left - right)).toEqual(families);
  });

  it('produit une trace couvrant toutes les règles, dans l\'ordre des priorités', () => {
    const result = realPrice('ORD-2024-001');

    expect(result.trace).toHaveLength(PRICING_RULES.length);
    expect(result.trace.map((traceEntry) => traceEntry.priority)).toEqual(
      [...PRICING_RULES].map((rule) => rule.priority).sort((left, right) => left - right),
    );
  });
});

describe('pureté', () => {
  it('ne mute ni les commandes, ni les clients, ni les produits, ni les règles', () => {
    const ordersSnapshot = JSON.stringify(dataset.orders);
    const customersSnapshot = JSON.stringify([...indexes.customersById.entries()]);
    const productsSnapshot = JSON.stringify([...indexes.productsById.entries()]);
    const ruleIds = PRICING_RULES.map((rule) => rule.id);

    realPrice('ORD-2024-001');
    realPrice('ORD-2024-021');
    realPrice('ORD-2024-009');

    expect(JSON.stringify(dataset.orders)).toBe(ordersSnapshot);
    expect(JSON.stringify([...indexes.customersById.entries()])).toBe(customersSnapshot);
    expect(JSON.stringify([...indexes.productsById.entries()])).toBe(productsSnapshot);
    expect(PRICING_RULES.map((rule) => rule.id)).toEqual(ruleIds);
  });

  it('ne partage pas les catégories produit avec le résultat de façon mutable', () => {
    const result = realPrice('ORD-2024-001');
    const product = indexes.productsById.get('P001');

    expect(result.lines[0]?.categories).toEqual(product?.categories);
  });
});
