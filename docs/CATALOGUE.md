# Catalogue de recettes

## Catalogue actuel — 2 novembre 2026

Le catalogue importable contient **128 recettes** : les 38 premières, le lot de 62 du 15 octobre, [20 soupes et mijotés saisonniers](SOUPES-MIJOTES.md) et [8 mijotés classiques](MIJOTES-CLASSIQUES.md) du 2 novembre. Les trois recettes de démarrage et les recettes personnelles du foyer ne font pas partie de ce nombre : le total affiché dans l'application peut donc être supérieur à 128. Publication des deux derniers lots demandée ; leur disponibilité sur le serveur nécessite la [mise à jour puis l'import volontaire](MISE-A-JOUR-CATALOGUE.md).

Dans **Recettes → Ajouter les recettes manquantes du catalogue**, l'application ajoute 28 fiches si les 100 précédentes sont déjà présentes, 8 depuis 120 ou 90 si seules les 38 premières sont présentes. Elle ignore un titre déjà enregistré, même si sa fiche a été modifiée. Elle ne remplace pas les ingrédients, étapes, photos, notes, favoris ou durées des fiches existantes. Un second import sans changement ajoute zéro recette. Après publication et déploiement du code, cet import reste volontaire : mettre à jour Docker seul ne copie pas les nouvelles fiches dans le foyer.

## Répartition

Toutes les fiches du catalogue sont prévues pour deux portions de référence ; le nombre peut être adapté dans l'application. Les durées incluent préparation, cuisson, repos et service indiqués dans les étapes. Ce sont des estimations, à adapter aux équipements et à l'épaisseur des aliments, pas un chronomètre garanti.

| Régime | Recettes |
| --- | ---: |
| Végétal | 59 |
| Végétarien | 31 |
| Poisson et fruits de mer | 9 |
| Sans restriction | 29 |

Les univers sont combinables : une même recette peut être économique, japonaise et express. Les nombres ci-dessous ne s'additionnent donc pas pour obtenir le total.

| Univers existant | Recettes |
| --- | ---: |
| Recettes du rat | 63 |
| Recettes de date | 30 |
| Plats mijotés | 36 |
| Japon | 12 |
| Chine | 11 |
| Terroir français | 51 |
| Côté chef | 14 |
| Express · 30 min max | 40 |
| Batch cooking | 30 |
| À emporter | 23 |
| Doudou food | 60 |
| Méditerranée | 24 |
| Italie | 17 |
| Inde | 9 |
| Mexique | 8 |

Les ajouts couvrent notamment omelette et galettes de légumes, soupes, croques, donburi, soba, udon, riz et nouilles sautés, currys, dal, lasagnes, quesadillas, burritos, gratins, papillotes, salades, tartes et risottos. Les deux lots du 2 novembre comprennent 12 soupes végétales, 4 mijotés végétaux et 12 mijotés à la viande. Les ingrédients sont quantifiés et chaque fiche contient au moins trois étapes propres au plat. Les 90 fiches ajoutées depuis les 38 premières ont des états cru/cuit explicites ; ils ne sont pas déduits automatiquement d'une étape de cuisson. Un aliment déjà cuit en conserve reste « cuit » même s'il est ensuite servi froid.

## Origine, images et limites

Les nouvelles descriptions sont rédigées pour Manger!, sous le même choix CC0 que les autres textes originaux du catalogue. Il ne s'agit pas d'un import de textes, photos ou avis de sites de recettes. Aucune note, popularité ou approbation culinaire n'est inventée. Les quatre adaptations saisonnières antérieures gardent leurs références ; leurs [sources et avis historiques](RECETTES-DE-SAISON.md) ne deviennent pas des évaluations de ce nouveau lot. Les inspirations et adaptations du lot soupes/mijotés sont distinguées dans [sa documentation](SOUPES-MIJOTES.md#références-et-limites).

Les recettes sont des propositions maison, pas des recettes testées en cuisine ni une certification d'authenticité régionale. « Côté chef » désigne une présentation ou préparation soignée, sans attribution à un grand chef ; « rat » ne garantit pas un prix calculé. Aucun calcul nutritionnel ou contrôle exhaustif des allergènes n'est ajouté. Les plats sans photo utilisent l'illustration existante, sans photo artificielle présentée comme celle du plat. Une photo personnelle reste prioritaire.

Le filtre de saison lit les ingrédients reconnus avec le mois local de l'appareil et le calendrier national français unique. Le titre et l'univers d'une recette ne lui imposent pas une saison. Les produits surgelés ou transformés ne prouvent pas une disponibilité fraîche locale ; couverture et limites du filtre inchangées. Une recette peut convenir à plusieurs saisons lorsque ses légumes le permettent.

## Précautions et références

Utiliser des légumineuses **déjà cuites et égouttées** lorsque cela figure dans le nom de l'ingrédient ; les quantités ne correspondent pas au poids sec. Les temps des paquets priment pour les nouilles, le riz et les produits précuits. Les indications de fin de cuisson et les contrôles de température accompagnent les durées, notamment pour la volaille et la viande hachée.

Les repères de température s'appuient sur le [tableau USDA/FSIS](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/safe-temperature-chart), consulté le 15 octobre 2026. Les pratiques de refroidissement et de séparation cru/cuit sont cohérentes avec les [bons gestes du ministère de l'Agriculture](https://agriculture.gouv.fr/cuisine-domicile-les-bons-gestes-dhygiene). Les étiquettes Batch cooking et À emporter ne dispensent pas de refroidir rapidement, de réfrigérer au plus tard deux heures après préparation et de maintenir le froid pendant le transport. Elles ne constituent pas une durée de conservation garantie.

## Maintenance et vérification

`catalog.js` conserve les 38 premières fiches et leur ordre ; `catalog-extra.js` ajoute les 62 suivantes, `catalog-seasonal.js` les 20 soupes/mijotés et `catalog-classics.js` les 8 classiques avec le même constructeur. Celui-ci accepte un état de préparation explicite par ingrédient et garde le mécanisme antérieur pour les anciennes fiches. Les 120 fiches précédentes ne sont pas modifiées par le dernier lot. Aucune dépendance, migration ou route nouvelle. L'import volontaire existant reste responsable de l'ajout sans remplacement.

Les régressions vérifient nombre, unicité des titres, validation des fiches, ingrédients, durées, étiquettes express, cru/cuit et imports depuis 38, 100 ou 120 fiches avec personnalisation. Le contrat d'import partagé couvre SQLite et PostgreSQL. Le lot soupes/mijotés vérifie aussi les inclusions et exclusions mensuelles des 20 fiches. La validation technique ne remplace pas un essai culinaire ; résultats et limites sont consignés dans [les décisions](DECISIONS.md).
