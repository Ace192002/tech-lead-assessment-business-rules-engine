/**
 * Petits utilitaires partagés par les deux CLI.
 *
 * Les scripts sont une pure couche d'entrée/sortie : tout calcul vit dans
 * `src/domain`, tout chargement dans `src/infrastructure`. Ce fichier ne
 * contient que du formatage et la gestion commune des erreurs — pas de
 * framework CLI, pas de dépendance.
 */

import { DomainError } from '../src/domain/errors';
import type { DataIssue } from '../src/infrastructure/data/dataIssues';

/** `null` → « — », sinon montant à deux décimales suffixé EUR. */
export function formatMoney(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)} EUR`;
}

/** `null` → « — », sinon pourcentage signé à deux décimales. */
export function formatPercent(value: number | null): string {
  if (value === null) {
    return '—';
  }
  return `${value > 0 ? '+' : ''}${value.toFixed(2)} %`;
}

/** Date → `YYYY-MM-DD` (UTC), pour les bornes de périodes. */
export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Bloc final de la sortie humaine : l'état de qualité du dataset, toujours visible. */
export function printDataIssues(issues: readonly DataIssue[]): void {
  console.log('');
  console.log(`Dataset issues: ${issues.length}`);
  for (const issue of issues) {
    console.log(
      `  [${issue.severity.toUpperCase().padEnd(7)}] ${issue.code.padEnd(26)} ${issue.entity}/${issue.entityId} — ${issue.message}`,
    );
  }
}

/**
 * Classement commun des échecs :
 * erreur métier connue → message clair, code 1 ; imprévu → code 1 aussi, mais
 * signalé comme tel pour ne pas déguiser un bug en erreur fonctionnelle.
 */
export function reportError(error: unknown): void {
  if (error instanceof DomainError || error instanceof RangeError) {
    console.error(`Erreur : ${error.message}`);
  } else {
    console.error(`Erreur inattendue : ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  }
  process.exitCode = 1;
}
