/**
 * CLI de la Question 2 — calcul du prix d'une commande.
 *
 *   npm run pricing -- ORD-2024-001
 *   npm run pricing -- ORD-2024-021 --json
 *
 * Couche d'entrée/sortie uniquement : le calcul vit dans `domain/pricing`.
 */

import { calculateOrderPrice } from '../src/domain/pricing/calculateOrderPrice';
import type { OrderPricingResult } from '../src/domain/pricing/types';
import { loadData } from '../src/infrastructure/data/loadData';
import { formatMoney, printDataIssues, reportError } from './cliUtils';

const USAGE = `Usage : npm run pricing -- <orderId> [options]

Options :
  --json   Sortie JSON { result, dataIssues } sur stdout.
  --help   Affiche cette aide.

Exemples :
  npm run pricing -- ORD-2024-001
  npm run pricing -- ORD-2024-021 --json`;

interface CliArgs {
  readonly orderId: string;
  readonly json: boolean;
}

type ParsedArgs =
  | { readonly kind: 'help' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'run'; readonly args: CliArgs };

function parseArgs(argv: readonly string[]): ParsedArgs {
  let orderId: string | undefined;
  let json = false;

  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') {
      return { kind: 'help' };
    }
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (argument.startsWith('--')) {
      return { kind: 'invalid', message: `Option inconnue : ${argument}` };
    }
    if (orderId !== undefined) {
      return { kind: 'invalid', message: `Un seul identifiant de commande attendu (reçu "${orderId}" et "${argument}").` };
    }
    orderId = argument;
  }

  if (orderId === undefined) {
    return { kind: 'invalid', message: 'Identifiant de commande manquant.' };
  }

  return { kind: 'run', args: { orderId, json } };
}

function printResult(result: OrderPricingResult): void {
  console.log(`Commande    : ${result.orderId}   Client : ${result.customerId}`);
  console.log(`Prix de base: ${formatMoney(result.basePrice)}`);
  console.log(`Prix final  : ${formatMoney(result.finalPrice)}`);
  console.log(`Passages    : ${result.iterations}`);

  console.log('');
  console.log('Lignes :');
  for (const line of result.lines) {
    console.log(
      `  ${line.productId}  x${String(line.quantity).padEnd(3)} @ ${formatMoney(line.unitPrice).padStart(12)}` +
        `  brut: ${formatMoney(line.baseAmount).padStart(12)}  final: ${formatMoney(line.finalAmount).padStart(12)}` +
        `  [${line.categories.join(', ')}]`,
    );
  }

  console.log('');
  console.log('Ajustements :');
  if (result.adjustments.length === 0) {
    console.log('  aucun');
  } else {
    for (const adjustment of result.adjustments) {
      console.log(`  ${adjustment.label.padEnd(20)} ${formatMoney(adjustment.amount).padStart(12)}`);
    }
  }

  console.log('');
  console.log('Trace :');
  console.log(
    `  ${'prio'.padStart(4)}  ${'règle'.padEnd(28)} ${'famille'.padEnd(12)} ${'passage'.padStart(7)}  ${'issue'.padEnd(9)}` +
      ` ${'avant'.padStart(12)} ${'après'.padStart(12)} ${'impact'.padStart(10)}  raison`,
  );
  for (const entry of result.trace) {
    const impact = `${entry.impact > 0 ? '+' : ''}${entry.impact.toFixed(2)}`;
    console.log(
      `  ${String(entry.priority).padStart(4)}  ${entry.ruleId.padEnd(28)} ${entry.family.padEnd(12)} ${String(entry.iteration).padStart(7)}` +
        `  ${entry.outcome.padEnd(9)} ${entry.amountBefore.toFixed(2).padStart(12)} ${entry.amountAfter.toFixed(2).padStart(12)}` +
        ` ${impact.padStart(10)}  ${entry.reason ?? '—'}`,
    );
  }
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.kind === 'help') {
    console.log(USAGE);
    return;
  }
  if (parsed.kind === 'invalid') {
    console.error(parsed.message);
    console.error('');
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  try {
    const { dataset, indexes, issues } = loadData();
    const result = calculateOrderPrice({
      orderId: parsed.args.orderId,
      orders: dataset.orders,
      customersById: indexes.customersById,
      productsById: indexes.productsById,
    });

    if (parsed.args.json) {
      // Rien d'autre sur stdout : la sortie doit rester parsable telle quelle.
      console.log(JSON.stringify({ result, dataIssues: issues }, null, 2));
      return;
    }

    printResult(result);
    printDataIssues(issues);
  } catch (error) {
    reportError(error);
  }
}

main();
