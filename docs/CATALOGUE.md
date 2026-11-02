# Catalogue de recettes

## Catalogue actuel — 2 novembre 2026

Le catalogue importable contient **178 recettes** : les 38 premières, le lot de 62 du 15 octobre, [20 soupes et mijotés saisonniers](SOUPES-MIJOTES.md), [8 mijotés classiques](MIJOTES-CLASSIQUES.md), puis [50 nouvelles propositions](CATALOGUE-50.md). Les trois recettes de démarrage et les recettes personnelles du foyer ne font pas partie de ce nombre : le total affiché dans l'application peut donc être supérieur à 178. Le déploiement du catalogue précédent de 128 est confirmé sur Linux ; ce nouveau lot nécessite une [mise à jour puis un import volontaire](MISE-A-JOUR-CATALOGUE.md).

Dans **Recettes → Ajouter les recettes manquantes du catalogue**, l'application ajoute 50 fiches depuis les 128 précédentes, 58 depuis 120, 78 depuis 100 ou 140 depuis les 38 premières. Elle ignore un titre déjà enregistré, même si sa fiche a été modifiée. Elle ne remplace pas les ingrédients, étapes, photos, notes, favoris ou durées des fiches existantes. Un second import sans changement ajoute zéro recette. Après publication et déploiement du code, cet import reste volontaire : mettre à jour Docker seul ne copie pas les nouvelles fiches dans le foyer.

## Répartition

Toutes les fiches du catalogue sont prévues pour deux portions de référence ; le nombre peut être adapté dans l'application. Les durées incluent préparation, cuisson, repos et service indiqués dans les étapes. Ce sont des estimations, à adapter aux équipements et à l'épaisseur des aliments, pas un chronomètre garanti.

| Régime | Recettes |
| --- | ---: |
| Végétal | 76 |
| Végétarien | 48 |
| Poisson et fruits de mer | 18 |
| Sans restriction | 36 |

Les univers sont combinables : une même recette peut être économique, japonaise et express. Les nombres ci-dessous ne s'additionnent donc pas pour obtenir le total.

| Univers existant | Recettes |
| --- | ---: |
| Recettes du rat | 84 |
| Recettes de date | 41 |
| Plats mijotés | 40 |
| Japon | 17 |
| Chine | 17 |
| Terroir français | 58 |
| Côté chef | 21 |
| Express · 30 min max | 58 |
| Batch cooking | 48 |
| À emporter | 37 |
| Doudou food | 80 |
| Méditerranée | 31 |
| Italie | 23 |
| Inde | 14 |
| Mexique | 13 |

Les ajouts couvrent notamment omelette et galettes de légumes, soupes, croques, donburi, soba, udon, riz et nouilles sautés, currys, dal, lasagnes, quesadillas, burritos, gratins, papillotes, salades, tartes et risottos. Après les 20 soupes/mijotés et les 8 classiques, le lot de 50 apporte 17 plats végétaux, 17 végétariens, 9 au poisson et 7 à la viande dans les quinze univers existants. Les ingrédients sont quantifiés et chaque fiche contient au moins trois étapes propres au plat. Les 140 fiches ajoutées depuis les 38 premières ont des états cru/cuit explicites ; ils ne sont pas déduits automatiquement d'une étape de cuisson. Un aliment déjà cuit en conserve reste « cuit » même s'il est ensuite servi froid.

## Origine, images et limites

Les nouvelles descriptions sont rédigées pour Manger!, sous le même choix CC0 que les autres textes originaux du catalogue. Il ne s'agit pas d'un import de textes, photos ou avis de sites de recettes. Aucune note, popularité ou approbation culinaire n'est inventée. Les quatre adaptations saisonnières antérieures gardent leurs références ; leurs [sources et avis historiques](RECETTES-DE-SAISON.md) ne deviennent pas des évaluations de ce nouveau lot. Les inspirations et adaptations du lot soupes/mijotés sont distinguées dans [sa documentation](SOUPES-MIJOTES.md#références-et-limites).

Les recettes sont des propositions maison, pas des recettes testées en cuisine ni une certification d'authenticité régionale. « Côté chef » désigne une présentation ou préparation soignée, sans attribution à un grand chef ; « rat » ne garantit pas un prix calculé. Aucun calcul nutritionnel ou contrôle exhaustif des allergènes n'est ajouté. Les plats sans photo utilisent l'illustration existante, sans photo artificielle présentée comme celle du plat. Une photo personnelle reste prioritaire.

Le filtre de saison lit les ingrédients reconnus avec le mois local de l'appareil et le calendrier national français unique. Le titre et l'univers d'une recette ne lui imposent pas une saison. Les produits surgelés ou transformés ne prouvent pas une disponibilité fraîche locale ; couverture et limites du filtre inchangées. Une recette peut convenir à plusieurs saisons lorsque ses légumes le permettent.

## Précautions et références

Utiliser des légumineuses **déjà cuites et égouttées** lorsque cela figure dans le nom de l'ingrédient ; les quantités ne correspondent pas au poids sec. Les temps des paquets priment pour les nouilles, le riz et les produits précuits. Les indications de fin de cuisson et les contrôles de température accompagnent les durées, notamment pour la volaille et la viande hachée.

Les repères de température s'appuient sur le [tableau USDA/FSIS](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/safe-temperature-chart), consulté le 15 octobre 2026. Les pratiques de refroidissement et de séparation cru/cuit sont cohérentes avec les [bons gestes du ministère de l'Agriculture](https://agriculture.gouv.fr/cuisine-domicile-les-bons-gestes-dhygiene). Les étiquettes Batch cooking et À emporter ne dispensent pas de refroidir rapidement, de réfrigérer au plus tard deux heures après préparation et de maintenir le froid pendant le transport. Elles ne constituent pas une durée de conservation garantie.

## Maintenance et vérification

`catalog.js` conserve les 38 premières fiches et leur ordre ; `catalog-extra.js` ajoute les 62 suivantes, `catalog-seasonal.js` les 20 soupes/mijotés, `catalog-classics.js` les 8 classiques et `catalog-world.js` les 50 nouvelles avec le même constructeur. Celui-ci accepte un état de préparation explicite par ingrédient et garde le mécanisme antérieur pour les anciennes fiches. Les 128 fiches précédentes ne sont pas modifiées par le dernier lot. Aucune dépendance, migration ou route nouvelle. L'import volontaire existant reste responsable de l'ajout sans remplacement.

Les régressions vérifient nombre, unicité des titres, validation des fiches, ingrédients, durées, étiquettes express, cru/cuit et imports depuis 38, 100, 120 ou 128 fiches avec personnalisation. Le contrat d'import partagé couvre SQLite et PostgreSQL. Le lot soupes/mijotés vérifie les inclusions et exclusions mensuelles des 20 fiches ; celui de 50 contrôle aussi les combinaisons saisonnières et la couverture de chaque univers existant. La validation technique ne remplace pas un essai culinaire ; résultats et limites sont consignés dans [les décisions](DECISIONS.md).
