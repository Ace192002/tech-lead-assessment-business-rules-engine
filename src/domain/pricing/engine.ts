/**
 * Moteur de règles ordonné, avec annulations et trace.
 *
 * Le problème central de la Question 2 : une règle tardive peut invalider une
 * règle déjà appliquée. Un pipeline mutable devrait alors « défaire »
 * mathématiquement une remise — opération fragile et inexacte dès que plusieurs
 * pourcentages se composent.
 *
 * Approche retenue : le moteur ne défait jamais rien. Il maintient un ensemble
 * de règles désactivées et, à chaque nouvelle désactivation, **repart de l'état
 * initial** en rejouant les règles restantes dans l'ordre. L'état du passage
 * instable est simplement abandonné.
 *
 * Cet ensemble est **monotone** : une règle désactivée ne redevient jamais
 * active pendant le même calcul. C'est ce qui garantit la terminaison. Une
 * réévaluation naïve de l'applicabilité, elle, réactiverait une règle
 * conditionnelle dont le seuil est de nouveau franchi, et oscillerait
 * indéfiniment.
 *
 * Aucune dépendance à React, Zod, Node ou à l'infrastructure.
 */

import { RuleEngineError } from '../errors';
import type {
  PricingRule,
  PricingState,
  RuleCancellation,
  RuleEngineResult,
  RuleOutcome,
  RuleTraceEntry,
} from './types';

export const DEFAULT_MAX_ITERATIONS = 10;

/**
 * Total dérivé, jamais stocké : somme des montants de lignes et des ajustements
 * de commande. Pleine précision — le moteur n'arrondit à aucun moment.
 */
export function getPricingStateTotal(state: PricingState): number {
  let total = 0;
  for (const line of state.lines) {
    total += line.amount;
  }
  for (const adjustment of state.adjustments) {
    total += adjustment.amount;
  }
  return total;
}

interface DisabledRecord {
  readonly outcome: 'cancelled' | 'replaced';
  readonly reason: string;
  readonly iteration: number;
}

interface PassEntry<TContext> {
  readonly rule: PricingRule<TContext>;
  readonly outcome: RuleOutcome;
  readonly amountBefore: number;
  readonly amountAfter: number;
  readonly iteration: number;
  readonly reason?: string;
}

type PassResult<TContext> =
  | {
      readonly stable: true;
      readonly state: PricingState;
      readonly entries: readonly PassEntry<TContext>[];
    }
  | {
      readonly stable: false;
      readonly newlyDisabled: readonly RuleCancellation[];
    };

/**
 * Trie par priorité croissante. L'index de déclaration départage les égalités :
 * plusieurs règles d'une même famille peuvent légitimement partager un niveau,
 * et leur ordre relatif doit rester celui du registre.
 */
function orderRules<TContext>(rules: readonly PricingRule<TContext>[]): PricingRule<TContext>[] {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.id)) {
      throw new RuleEngineError(
        `Identifiant de règle dupliqué : "${rule.id}". Les identifiants doivent être uniques.`,
      );
    }
    seen.add(rule.id);
  }

  return rules
    .map((rule, index) => ({ rule, index }))
    .sort((left, right) => left.rule.priority - right.rule.priority || left.index - right.index)
    .map((entry) => entry.rule);
}

function runPass<TContext>(
  context: TContext,
  orderedRules: readonly PricingRule<TContext>[],
  initialState: PricingState,
  disabled: ReadonlyMap<string, DisabledRecord>,
  knownRuleIds: ReadonlySet<string>,
  iteration: number,
): PassResult<TContext> {
  let state = initialState;
  const entries: PassEntry<TContext>[] = [];

  for (const rule of orderedRules) {
    const amountBefore = getPricingStateTotal(state);
    const disabledRecord = disabled.get(rule.id);

    if (disabledRecord !== undefined) {
      // La règle garde sa place dans la trace, à impact nul, au point où elle
      // aurait été rencontrée.
      entries.push({
        rule,
        outcome: disabledRecord.outcome,
        amountBefore,
        amountAfter: amountBefore,
        iteration: disabledRecord.iteration,
        reason: disabledRecord.reason,
      });
      continue;
    }

    const evaluation = rule.evaluate(context, state);

    if (evaluation.outcome === 'skipped') {
      entries.push({
        rule,
        outcome: 'skipped',
        amountBefore,
        amountAfter: amountBefore,
        iteration,
        reason: evaluation.reason,
      });
      continue;
    }

    const cancellations = evaluation.cancellations ?? [];
    for (const cancellation of cancellations) {
      if (cancellation.ruleId === rule.id) {
        throw new RuleEngineError(`La règle "${rule.id}" ne peut pas s'annuler elle-même.`);
      }
      if (!knownRuleIds.has(cancellation.ruleId)) {
        throw new RuleEngineError(
          `La règle "${rule.id}" cherche à désactiver un identifiant inconnu : "${cancellation.ruleId}".`,
        );
      }
    }

    // Seules les désactivations *nouvelles* rendent le passage instable : au
    // passage stable, la règle réémet les siennes sans relancer le calcul.
    const newlyDisabled = cancellations.filter((cancellation) => !disabled.has(cancellation.ruleId));
    if (newlyDisabled.length > 0) {
      return { stable: false, newlyDisabled };
    }

    state = evaluation.state;
    entries.push({
      rule,
      outcome: 'applied',
      amountBefore,
      amountAfter: getPricingStateTotal(state),
      iteration,
      ...(evaluation.reason === undefined ? {} : { reason: evaluation.reason }),
    });
  }

  return { stable: true, state, entries };
}

function toTraceEntry<TContext>(entry: PassEntry<TContext>): RuleTraceEntry {
  const base = {
    ruleId: entry.rule.id,
    label: entry.rule.label,
    family: entry.rule.family,
    priority: entry.rule.priority,
    iteration: entry.iteration,
    outcome: entry.outcome,
    amountBefore: entry.amountBefore,
    amountAfter: entry.amountAfter,
    impact: entry.amountAfter - entry.amountBefore,
  };

  return entry.reason === undefined ? base : { ...base, reason: entry.reason };
}

export interface RunPricingRulesParams<TContext> {
  readonly context: TContext;
  readonly rules: readonly PricingRule<TContext>[];
  readonly initialState: PricingState;
  /** Garde-fou défensif contre une non-convergence ; 10 par défaut. */
  readonly maxIterations?: number;
}

export function runPricingRules<TContext>(
  params: RunPricingRulesParams<TContext>,
): RuleEngineResult {
  const { context, rules, initialState, maxIterations = DEFAULT_MAX_ITERATIONS } = params;

  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new RuleEngineError(`maxIterations doit être un entier positif (reçu : ${maxIterations}).`);
  }

  const orderedRules = orderRules(rules);
  const knownRuleIds = new Set(orderedRules.map((rule) => rule.id));
  const disabled = new Map<string, DisabledRecord>();

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const pass = runPass(context, orderedRules, initialState, disabled, knownRuleIds, iteration);

    if (pass.stable) {
      return {
        state: pass.state,
        trace: pass.entries.map(toTraceEntry),
        iterations: iteration,
        disabledRuleIds: [...disabled.keys()],
      };
    }

    for (const cancellation of pass.newlyDisabled) {
      disabled.set(cancellation.ruleId, {
        outcome: cancellation.outcome,
        reason: cancellation.reason,
        iteration,
      });
    }
  }

  throw new RuleEngineError(
    `Le moteur n'a pas convergé après ${maxIterations} passages. ` +
      `Règles désactivées : ${[...disabled.keys()].join(', ') || 'aucune'}.`,
  );
}
