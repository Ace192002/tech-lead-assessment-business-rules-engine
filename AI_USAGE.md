# Usage de l’intelligence artificielle

L’énoncé autorise l’utilisation d’outils d’intelligence artificielle à condition de la documenter. Ils ont été utilisés comme assistants de conception, de développement et de revue, sous contrôle humain.

## Outils utilisés

**Claude Code** a été utilisé comme outil de pair programming directement dans le dépôt : analyse des fichiers, propositions d’implémentation, génération et modification de portions de code, suggestion de tests, exécution des vérifications et assistance lors de certains contrôles navigateur.

**ChatGPT** a été utilisé pour analyser l’énoncé, challenger les choix d’architecture, identifier les ambiguïtés métier, découper le travail en étapes et revoir les résultats intermédiaires.

Aucune intelligence artificielle n’intervient dans l’exécution du programme livré.

## Usages principaux

Les outils ont notamment contribué à :

- analyser les données fournies et identifier leurs anomalies ;
- proposer des implémentations pour la validation, l’historique client, le moteur de règles, les CLI et l’interface React ;
- identifier des cas limites portant sur les dates UTC, les semaines ISO, les seuils, les références inconnues et la convergence du moteur ;
- proposer et compléter les tests automatisés ;
- assister la rédaction et la revue de la documentation.

## Processus de contrôle

Le travail a été découpé en commits de périmètre limité. Chaque étape a été relue et validée avant de poursuivre.

Les contrôles réalisés comprennent :

- vérification des fichiers et des différences Git ;
- typecheck TypeScript ;
- tests automatisés ;
- exécution réelle des deux CLI ;
- validation des sorties JSON ;
- tests sous plusieurs fuseaux horaires ;
- vérifications dans le navigateur, notamment à 375 px ;
- validation manuelle des décisions métier et des résultats numériques.

Les propositions de l’IA n’ont pas été considérées comme correctes par défaut. Elles ont été modifiées ou rejetées lorsqu’elles ne respectaient pas l’énoncé ou les choix d’architecture.

## Exemples d’arbitrages

Plusieurs propositions ont été corrigées au cours du développement :

- `ORD-2024-080` a été distinguée des sept véritables anomalies de données : il s’agit d’une commande valide située exactement sur la borne basse de la fenêtre ;
- le calcul du montant brut a été placé dans le domaine partagé afin de préserver l’indépendance entre les Questions 1 et 2 ;
- les références produit inconnues restent visibles dans l’historique, mais rendent la commande non chiffrable plutôt que de produire un total partiel silencieux ;
- les règles annulées ou remplacées sont rejouées depuis l’état brut afin d’éviter une inversion mathématique fragile ;
- la sortie JSON exécutée via `npm run` a été contrôlée avec `JSON.parse` et corrigée afin de ne contenir aucun texte parasite ;
- une vérification réelle à 375 px a révélé puis permis de corriger un débordement horizontal global.

## Responsabilité finale

Je reste responsable des décisions techniques, de la compréhension du code et du résultat livré. Les fichiers JSON fournis n’ont pas été modifiés. Toute proposition intégrée a été relue, adaptée lorsque nécessaire et validée par les contrôles décrits ci-dessus.