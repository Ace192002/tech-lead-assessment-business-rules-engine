/**
 * Arrondi commercial partagé entre la Question 1 et la Question 2.
 *
 * Les calculs internes restent en pleine précision ; cet arrondi n'intervient
 * qu'au moment d'exposer une valeur (montant ou pourcentage). Arrondir à chaque
 * étape ferait basculer des décisions de seuil : un montant après règles de base
 * de 500,004 € franchit le palier « > 500 € », alors qu'arrondi à 500,00 € il ne
 * le franchirait plus.
 *
 * `Number.EPSILON` compense la représentation binaire des flottants : sans lui,
 * `1.005 * 100` vaut `100.49999999999999` et s'arrondirait à `1.00`.
 */
export function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
