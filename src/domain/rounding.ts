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
 *
 * L'arrondi est appliqué à la **valeur absolue**, puis le signe est restitué :
 * `Math.round` arrondit les demis vers `+∞` (`Math.round(-100.5) === -100`), si
 * bien que `-1,005` serait devenu `-1,00` quand `1,005` devient `1,01`. Ajouter
 * `Number.EPSILON` aggravait l'asymétrie en poussant les négatifs vers zéro.
 * Les pourcentages d'évolution étant signés, deux périodes symétriques doivent
 * s'arrondir symétriquement.
 */
export function roundToTwoDecimals(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(value) + Number.EPSILON) * 100)) / 100;
}
