import { describe, expect, it } from 'vitest';

import { RuleEngineError } from '../errors';
import { getPricingStateTotal, runPricingRules } from './engine';
import type { PricingLine, PricingRule, PricingState, RuleCancellation } from './types';

/** Les règles métier de l'énoncé arriveront au commit suivant ; ici, des règles jouets. */
interface TestContext {
  readonly label: string;
}

const CONTEXT: TestContext = { label: 'test' };

function makeLine(productId: string, unitPrice: number, quantity: number): PricingLine {
  return {
    productId,
    quantity,
    unitPrice,
    categories: ['Catégorie'],
    baseAmount: unitPrice * quantity,
    amount: unitPrice * quantity,
  };
}

function makeState(lines: PricingLine[] = [makeLine('P1', 1000, 1)]): PricingState {
  return { lines, adjustments: [] };
}

function run(
  rules: readonly PricingRule<TestContext>[],
  initialState: PricingState = makeState(),
  maxIterations?: number,
) {
  return runPricingRules({
    context: CONTEXT,
    rules,
    initialState,
    ...(maxIterations === undefined ? {} : { maxIterations }),
  });
}

// --- Règles synthétiques ------------------------------------------------------

/** Multiplie chaque ligne : un pourcentage, donc non commutatif avec un ajout fixe. */
function multiplyLines(
  id: string,
  priority: number,
  factor: number,
  cancellations: RuleCancellation[] = [],
): PricingRule<TestContext> {
  return {
    id,
    label: `${id} ×${factor}`,
    family: 'base',
    priority,
    evaluate: (_context, state) => ({
      outcome: 'applied',
      state: {
        ...state,
        lines: state.lines.map((line) => ({ ...line, amount: line.amount * factor })),
      },
      ...(cancellations.length > 0 ? { cancellations } : {}),
    }),
  };
}

/** Ajoute un montant fixe à la première ligne. */
function addToFirstLine(id: string, priority: number, amount: number): PricingRule<TestContext> {
  return {
    id,
    label: `${id} +${amount}`,
    family: 'category',
    priority,
    evaluate: (_context, state) => ({
      outcome: 'applied',
      state: {
        ...state,
        lines: state.lines.map((line, index) =>
          index === 0 ? { ...line, amount: line.amount + amount } : line,
        ),
      },
    }),
  };
}

/** Ajustement fixe au niveau de la commande. */
function addAdjustment(id: string, priority: number, amount: number): PricingRule<TestContext> {
  return {
    id,
    label: `${id} ${amount >= 0 ? '+' : ''}${amount}`,
    family: 'final',
    priority,
    evaluate: (_context, state) => ({
      outcome: 'applied',
      state: {
        ...state,
        adjustments: [...state.adjustments, { ruleId: id, label: id, amount }],
      },
    }),
  };
}

function alwaysSkipped(id: string, priority: number, reason: string): PricingRule<TestContext> {
  return {
    id,
    label: id,
    family: 'conditional',
    priority,
    evaluate: () => ({ outcome: 'skipped', reason }),
  };
}

/** N'applique sa réduction qu'au-dessus d'un seuil : imite une règle conditionnelle. */
function aboveThreshold(id: string, priority: number, threshold: number, factor: number): PricingRule<TestContext> {
  return {
    id,
    label: `${id} au-delà de ${threshold}`,
    family: 'conditional',
    priority,
    evaluate: (_context, state) => {
      const total = getPricingStateTotal(state);
      if (total <= threshold) {
        return { outcome: 'skipped', reason: `total ${total} ≤ ${threshold}` };
      }
      return {
        outcome: 'applied',
        state: {
          ...state,
          lines: state.lines.map((line) => ({ ...line, amount: line.amount * factor })),
        },
        reason: `total ${total} > ${threshold}`,
      };
    },
  };
}

const traceOf = (result: { trace: readonly { ruleId: string }[] }): string[] =>
  result.trace.map((entry) => entry.ruleId);

// -----------------------------------------------------------------------------

describe('ordre d\'application', () => {
  it('suit la priorité croissante, pas l\'ordre de déclaration', () => {
    const result = run([multiplyLines('tardive', 20, 0.5), multiplyLines('precoce', 10, 0.5)]);

    expect(traceOf(result)).toEqual(['precoce', 'tardive']);
    expect(result.trace.map((entry) => entry.priority)).toEqual([10, 20]);
  });

  it('conserve l\'ordre de déclaration à priorité égale', () => {
    const pourcentageDAbord = run([multiplyLines('pct', 10, 0.9), addToFirstLine('fixe', 10, 100)]);
    const fixeDAbord = run([addToFirstLine('fixe', 10, 100), multiplyLines('pct', 10, 0.9)]);

    expect(traceOf(pourcentageDAbord)).toEqual(['pct', 'fixe']);
    expect(traceOf(fixeDAbord)).toEqual(['fixe', 'pct']);
  });

  it('change réellement le résultat lorsque la priorité change', () => {
    // 1000 × 0,9 puis +100 = 1000 ; +100 puis × 0,9 = 990.
    const pourcentageDAbord = run([multiplyLines('pct', 10, 0.9), addToFirstLine('fixe', 20, 100)]);
    const fixeDAbord = run([multiplyLines('pct', 20, 0.9), addToFirstLine('fixe', 10, 100)]);

    expect(getPricingStateTotal(pourcentageDAbord.state)).toBe(1000);
    expect(getPricingStateTotal(fixeDAbord.state)).toBe(990);
  });
});

describe('règle ignorée', () => {
  it('laisse l\'état strictement inchangé et trace sa raison', () => {
    const initialState = makeState();
    const result = run([alwaysSkipped('ignoree', 10, 'condition non remplie')], initialState);

    expect(result.state).toEqual(initialState);
    expect(getPricingStateTotal(result.state)).toBe(1000);
    expect(result.trace[0]).toMatchObject({
      ruleId: 'ignoree',
      outcome: 'skipped',
      amountBefore: 1000,
      amountAfter: 1000,
      impact: 0,
      reason: 'condition non remplie',
    });
  });
});

describe('règle appliquée', () => {
  it('trace un avant, un après et un impact cohérents', () => {
    const result = run([multiplyLines('remise', 10, 0.9), addAdjustment('express', 20, 15)]);

    expect(result.trace).toHaveLength(2);
    expect(result.trace[0]).toMatchObject({
      ruleId: 'remise',
      outcome: 'applied',
      amountBefore: 1000,
      amountAfter: 900,
      impact: -100,
      family: 'base',
    });
    expect(result.trace[1]).toMatchObject({
      ruleId: 'express',
      amountBefore: 900,
      amountAfter: 915,
      impact: 15,
    });
    expect(getPricingStateTotal(result.state)).toBe(915);
  });

  it('n\'exécute aucun passage supplémentaire sans annulation', () => {
    const result = run([multiplyLines('remise', 10, 0.9)]);

    expect(result.iterations).toBe(1);
    expect(result.disabledRuleIds).toEqual([]);
  });
});

describe('remplacement d\'une règle antérieure', () => {
  const result = run([
    multiplyLines('palier500', 10, 0.5),
    multiplyLines('palier1000', 30, 0.8, [
      { ruleId: 'palier500', outcome: 'replaced', reason: 'remplacée par le palier 1000 €' },
    ]),
  ]);

  it('rejoue depuis l\'état initial : la règle remplacée n\'a aucun effet résiduel', () => {
    // 1000 × 0,8 = 800. Une inversion mathématique naïve aurait donné
    // 1000 × 0,5 × 0,8 = 400.
    expect(getPricingStateTotal(result.state)).toBe(800);
    expect(result.iterations).toBe(2);
  });

  it('trace la règle remplacée à sa place, avec un impact nul', () => {
    expect(result.trace[0]).toMatchObject({
      ruleId: 'palier500',
      outcome: 'replaced',
      amountBefore: 1000,
      amountAfter: 1000,
      impact: 0,
      iteration: 1,
      reason: 'remplacée par le palier 1000 €',
    });
    expect(result.trace[1]).toMatchObject({ ruleId: 'palier1000', outcome: 'applied', iteration: 2 });
  });

  it('expose la règle désactivée dans le résultat', () => {
    expect(result.disabledRuleIds).toEqual(['palier500']);
  });
});

describe('annulation d\'une règle antérieure', () => {
  const result = run([
    multiplyLines('conditionnelle', 10, 0.95),
    multiplyLines('volume', 30, 0.4, [
      { ruleId: 'conditionnelle', outcome: 'cancelled', reason: 'total repassé sous 500 €' },
    ]),
  ]);

  it('trace l\'annulation avec son motif', () => {
    expect(result.trace[0]).toMatchObject({
      ruleId: 'conditionnelle',
      outcome: 'cancelled',
      impact: 0,
      reason: 'total repassé sous 500 €',
    });
    expect(result.disabledRuleIds).toEqual(['conditionnelle']);
  });

  it('produit un total exempt de la règle annulée', () => {
    expect(getPricingStateTotal(result.state)).toBe(400); // 1000 × 0,4
  });
});

describe('monotonie des désactivations', () => {
  it('ne réactive jamais une règle annulée, même si sa condition est de nouveau remplie', () => {
    const result = run([
      aboveThreshold('conditionnelle', 10, 500, 0.95),
      multiplyLines('volume', 30, 0.4, [
        { ruleId: 'conditionnelle', outcome: 'cancelled', reason: 'seuil invalidé par le volume' },
      ]),
    ]);

    // Au passage stable, le total vaut 1000 quand « conditionnelle » est
    // rencontrée : sa condition (> 500) est satisfaite. Elle reste pourtant
    // désactivée — sans quoi le moteur oscillerait indéfiniment.
    expect(result.trace[0]).toMatchObject({
      ruleId: 'conditionnelle',
      outcome: 'cancelled',
      amountBefore: 1000,
      amountAfter: 1000,
    });
    expect(getPricingStateTotal(result.state)).toBe(400);
    expect(result.iterations).toBe(2);
  });

  it('converge en plusieurs passages sur des annulations en cascade', () => {
    const result = run([
      multiplyLines('r1', 10, 0.9),
      multiplyLines('r2', 20, 0.8, [
        { ruleId: 'r1', outcome: 'cancelled', reason: 'r2 invalide r1' },
      ]),
      multiplyLines('r3', 30, 0.5, [
        { ruleId: 'r2', outcome: 'replaced', reason: 'r3 remplace r2' },
      ]),
    ]);

    expect(result.iterations).toBe(3);
    expect(result.disabledRuleIds).toEqual(['r1', 'r2']);
    expect(result.trace.map((entry) => entry.outcome)).toEqual(['cancelled', 'replaced', 'applied']);
    expect(getPricingStateTotal(result.state)).toBe(500); // 1000 × 0,5 seulement
  });
});

describe('configurations rejetées', () => {
  it('rejette des identifiants de règles dupliqués', () => {
    expect(() => run([multiplyLines('doublon', 10, 0.9), multiplyLines('doublon', 20, 0.8)])).toThrow(
      RuleEngineError,
    );
    expect(() => run([multiplyLines('doublon', 10, 0.9), multiplyLines('doublon', 20, 0.8)])).toThrow(
      /dupliqué/,
    );
  });

  it('rejette l\'annulation d\'un identifiant inconnu', () => {
    expect(() =>
      run([
        multiplyLines('regle', 10, 0.9, [
          { ruleId: 'fantome', outcome: 'cancelled', reason: 'inexistante' },
        ]),
      ]),
    ).toThrow(/identifiant inconnu/);
  });

  it('rejette une règle qui s\'annule elle-même', () => {
    expect(() =>
      run([
        multiplyLines('boucle', 10, 0.9, [
          { ruleId: 'boucle', outcome: 'cancelled', reason: 'auto-annulation' },
        ]),
      ]),
    ).toThrow(/ne peut pas s'annuler elle-même/);
  });

  it('rejette une non-convergence au lieu de la masquer', () => {
    const cascade = [
      multiplyLines('r1', 10, 0.9),
      multiplyLines('r2', 20, 0.8, [{ ruleId: 'r1', outcome: 'cancelled', reason: 'r2 invalide r1' }]),
      multiplyLines('r3', 30, 0.5, [{ ruleId: 'r2', outcome: 'replaced', reason: 'r3 remplace r2' }]),
    ];

    // La cascade demande 3 passages ; le plafond en autorise 2.
    expect(() => run(cascade, makeState(), 2)).toThrow(RuleEngineError);
    expect(() => run(cascade, makeState(), 2)).toThrow(/n'a pas convergé après 2 passages/);
    expect(run(cascade, makeState(), 3).iterations).toBe(3);
  });

  it('rejette un plafond de passages incohérent', () => {
    expect(() => run([multiplyLines('r', 10, 0.9)], makeState(), 0)).toThrow(RuleEngineError);
  });
});

describe('total dérivé', () => {
  it('somme les montants de lignes et les ajustements, positifs comme négatifs', () => {
    const state: PricingState = {
      lines: [makeLine('P1', 100, 2), makeLine('P2', 50, 1)],
      adjustments: [
        { ruleId: 'express', label: 'Express', amount: 15 },
        { ruleId: 'geste', label: 'Geste commercial', amount: -30 },
      ],
    };

    expect(getPricingStateTotal(state)).toBe(235); // 200 + 50 + 15 − 30
  });

  it('vaut 0 sur un état vide', () => {
    expect(getPricingStateTotal({ lines: [], adjustments: [] })).toBe(0);
  });

  it('reflète les ajustements ajoutés par les règles', () => {
    const result = run([addAdjustment('frais', 10, 5), addAdjustment('remboursement', 20, -20)]);

    expect(getPricingStateTotal(result.state)).toBe(985);
  });
});

describe('précision interne', () => {
  it('n\'arrondit pas le total dérivé', () => {
    // 0,1 × 3 vaut 0.30000000000000004 en flottant : le total porte encore
    // l'erreur de représentation, il n'a pas été « nettoyé ».
    const state = makeState([makeLine('P1', 0.1, 3)]);

    expect(getPricingStateTotal(state)).toBe(0.1 * 3);
    expect(getPricingStateTotal(state)).not.toBe(0.3);
  });

  it('laisse l\'erreur de représentation traverser les règles', () => {
    const result = run([multiplyLines('double', 10, 2)], makeState([makeLine('P1', 0.1, 3)]));

    expect(getPricingStateTotal(result.state)).toBe(0.1 * 3 * 2);
    expect(getPricingStateTotal(result.state)).not.toBe(0.6);
  });

  it('additionne lignes et ajustements en pleine précision', () => {
    const state: PricingState = {
      lines: [makeLine('P1', 0.1, 1)],
      adjustments: [{ ruleId: 'ajout', label: 'Ajout', amount: 0.2 }],
    };

    expect(getPricingStateTotal(state)).toBe(0.1 + 0.2);
    expect(getPricingStateTotal(state)).not.toBe(0.3);
  });
});

describe('pureté', () => {
  it('ne mute ni l\'état initial, ni ses lignes, ni ses catégories, ni ses ajustements', () => {
    const initialState: PricingState = {
      lines: [makeLine('P1', 100, 2), makeLine('P2', 50, 3)],
      adjustments: [{ ruleId: 'depart', label: 'Départ', amount: 10 }],
    };
    const snapshot = JSON.stringify(initialState);

    run(
      [
        multiplyLines('remise', 10, 0.9),
        addToFirstLine('taxe', 20, 25),
        addAdjustment('express', 30, 15),
      ],
      initialState,
    );

    expect(JSON.stringify(initialState)).toBe(snapshot);
    expect(initialState.lines[0]?.amount).toBe(200);
  });

  it('ne mute pas le tableau de règles reçu', () => {
    const rules = [multiplyLines('tardive', 20, 0.5), multiplyLines('precoce', 10, 0.5)];
    const declarationOrder = rules.map((rule) => rule.id);

    run(rules);

    expect(rules.map((rule) => rule.id)).toEqual(declarationOrder);
  });

  it('accepte un registre de règles vide', () => {
    const initialState = makeState();
    const result = run([], initialState);

    expect(result.state).toEqual(initialState);
    expect(result.trace).toEqual([]);
    expect(result.iterations).toBe(1);
  });
});
