# Catalogue de recettes

## Lot du 15 octobre 2026

Le catalogue importable contient **100 recettes**, dont **62 nouvelles fiches** ajoutées aux 38 précédentes. Les trois recettes de démarrage et les recettes personnelles du foyer ne font pas partie de ce nombre : le total affiché dans l'application peut donc être supérieur à 100.

Dans **Recettes → Ajouter les recettes manquantes du catalogue**, l'application ajoute 62 fiches si les 38 précédentes sont déjà présentes. Elle ignore un titre déjà enregistré, même si sa fiche a été modifiée. Elle ne remplace pas les ingrédients, étapes, photos, notes, favoris ou durées des fiches existantes. Un second import sans changement ajoute zéro recette. Mettre à jour Docker seul ne copie pas les nouvelles fiches dans le foyer : cet import reste volontaire.

## Répartition

Toutes les fiches du catalogue sont prévues pour deux portions de référence ; le nombre peut être adapté dans l'application. Les durées incluent préparation, cuisson, repos et service indiqués dans les étapes. Ce sont des estimations, à adapter aux équipements et à l'épaisseur des aliments, pas un chronomètre garanti.

| Régime | Recettes |
| --- | ---: |
| Végétal | 43 |
| Végétarien | 31 |
| Poisson et fruits de mer | 9 |
| Sans restriction | 17 |

Les univers sont combinables : une même recette peut être économique, japonaise et express. Les nombres ci-dessous ne s'additionnent donc pas pour obtenir le total.

| Univers existant | Recettes |
| --- | ---: |
| Recettes du rat | 43 |
| Recettes de date | 30 |
| Plats mijotés | 20 |
| Japon | 12 |
| Chine | 11 |
| Terroir français | 28 |
| Côté chef | 14 |
| Express · 30 min max | 40 |
| Batch cooking | 30 |
| À emporter | 23 |
| Doudou food | 32 |
| Méditerranée | 18 |
| Italie | 17 |
| Inde | 9 |
| Mexique | 8 |

Les ajouts couvrent notamment omelette et galettes de légumes, soupes, croques, donburi, soba, udon, riz et nouilles sautés, currys, dal, lasagnes, quesadillas, burritos, gratins, papillotes, salades, tartes et risottos. Les ingrédients sont quantifiés et chaque fiche contient au moins trois étapes propres au plat. Les 62 nouvelles fiches ont des états cru/cuit explicitement relus ; ils ne sont pas déduits automatiquement d'une étape de cuisson. Un aliment déjà cuit en conserve reste « cuit » même s'il est ensuite servi froid.

## Origine, images et limites

Les nouvelles descriptions sont rédigées pour Manger!, sous le même choix CC0 que les autres textes originaux du catalogue. Il ne s'agit pas d'un import de textes, photos ou avis de sites de recettes. Aucune note, popularité ou approbation culinaire n'est inventée. Les quatre adaptations saisonnières antérieures gardent leurs références ; leurs [sources et avis historiques](RECETTES-DE-SAISON.md) ne deviennent pas des évaluations de ce nouveau lot.

Les recettes sont des propositions maison, pas des recettes testées en cuisine ni une certification d'authenticité régionale. « Côté chef » désigne une présentation ou préparation soignée, sans attribution à un grand chef ; « rat » ne garantit pas un prix calculé. Aucun calcul nutritionnel ou contrôle exhaustif des allergènes n'est ajouté. Les plats sans photo utilisent l'illustration existante, sans photo artificielle présentée comme celle du plat. Une photo personnelle reste prioritaire.

Le filtre de saison continue de lire les ingrédients reconnus avec le mois local et le calendrier choisi. Le titre et l'univers d'une recette ne lui imposent pas une saison. Les produits surgelés ou transformés ne prouvent pas une disponibilité fraîche locale ; couverture et limites du filtre inchangées.

## Précautions et références

Utiliser des légumineuses **déjà cuites et égouttées** lorsque cela figure dans le nom de l'ingrédient ; les quantités ne correspondent pas au poids sec. Les temps des paquets priment pour les nouilles, le riz et les produits précuits. Les indications de fin de cuisson et les contrôles de température accompagnent les durées, notamment pour la volaille et la viande hachée.

Les repères de température s'appuient sur le [tableau USDA/FSIS](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/safe-temperature-chart), consulté le 15 octobre 2026. Les pratiques de refroidissement et de séparation cru/cuit sont cohérentes avec les [bons gestes du ministère de l'Agriculture](https://agriculture.gouv.fr/cuisine-domicile-les-bons-gestes-dhygiene). Les étiquettes Batch cooking et À emporter ne dispensent pas de refroidir rapidement, de réfrigérer au plus tard deux heures après préparation et de maintenir le froid pendant le transport. Elles ne constituent pas une durée de conservation garantie.

## Maintenance et vérification

`catalog.js` conserve les 38 premières fiches et leur ordre ; `catalog-extra.js` ajoute les 62 nouvelles avec le même constructeur. Celui-ci accepte un état de préparation explicite par ingrédient et garde le mécanisme antérieur pour les anciennes fiches. Aucune dépendance, migration ou route nouvelle. L'import volontaire existant reste responsable de l'ajout sans remplacement.

Les régressions vérifient nombre, unicité des titres, validation des 100 fiches, ingrédients, durées, étiquettes express, cru/cuit et import depuis une bibliothèque ancienne avec personnalisation. Les quatre tests de référence saisonniers ciblent désormais leur lot précis plutôt que les quatre derniers éléments d'un catalogue qui grandit. La validation technique ne remplace pas un essai culinaire ; les résultats navigateur et les limites de déploiement sont consignés dans [les décisions](DECISIONS.md#catalogue-de-100-recettes--15-octobre-2026).
