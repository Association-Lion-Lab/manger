# Recettes pour vérifier le filtre de saison

Lot historique du **12 octobre 2026** : quatre ajouts portaient alors le catalogue à **38 recettes**. Le [lot du 15 octobre](CATALOGUE.md) le porte à 100, sans remplacer ces quatre fiches ni modifier les repères ci-dessous. Pas de nouveau réglage ni d'import automatique dans les foyers existants.

**Depuis le 2 novembre 2026 : un seul calendrier national français.** Les recettes de toutes régions sont regroupées ; le choix Bretagne/Hauts-de-France et ses variantes de calcul sont retirés. Un ancien réglage enregistré est ignoré. Le mois suit toujours la date du téléphone ou de l’ordinateur. La simplification ne modifie aucune recette, base ou donnée du planning ; aucune étiquette de saison manuelle n’est requise.

## Ajouter et comparer

1. Mettre à jour l'application, puis ouvrir **Recettes**.
2. Utiliser **Ajouter les recettes manquantes du catalogue** : le bouton ajoute tout titre manquant du catalogue actuel. Les quatre ajouts seuls correspondaient au lot historique ; depuis le 15 octobre, 62 autres fiches sont disponibles. Un titre déjà présent reste inchangé, même personnalisé.
3. Activer **De saison**. Le calendrier français est automatique ; le mois suit la date locale du téléphone ou de l'ordinateur, sans être changé par la semaine affichée dans le planning.
4. En octobre, chercher « potimarron », puis « asperges » : le velouté apparaît, le risotto non. Désactiver De saison retrouve le risotto. Les autres filtres actifs peuvent aussi limiter les résultats.

Les saisons ci-dessous servent de repères de lecture, pas d'étiquettes forcées dans les recettes. Le calcul lit les ingrédients frais reconnus, selon le mois du calendrier national. Une recette peut couvrir plusieurs saisons ; cela ne garantit ni la provenance locale ni une disponibilité réelle au magasin.

| Repère | Recette ajoutée | Janvier | Avril | Juillet | Octobre |
| --- | --- | --- | --- | --- | --- |
| Printemps | Risotto crémeux aux asperges | Non | Oui | Non | Non |
| Été | Tian de légumes d’été | Non | Non | Oui | Non |
| Automne | Velouté de potimarron et pommes de terre | Non | Non | Non | Oui |
| Hiver | Endives au jambon gratinées | Oui | Oui | Non | Oui |

Table du calendrier national utilisé pour toutes les recettes. Les anciennes différences régionales ne s’appliquent plus. Le potimarron conserve le repère national octobre–décembre ; le mot « hiver » ne suffit pas à rendre le velouté positif en janvier.

## Filtre plus sélectif — 12 octobre 2026

Le filtre exige au moins un fruit ou légume reconnu du mois dont le calendrier national ne couvre pas les douze mois. Un produit disponible toute l'année, comme la carotte dans ce calendrier, ne suffit pas. Tout fruit ou légume reconnu hors saison reste excluant. Les ingrédients inconnus ou transformés ne sont pas évalués : ce n'est pas une certification exhaustive du plat.

En octobre, **Bœuf carottes du dimanche** sort donc du filtre, tandis que **Cabillaud citron et poireaux au four** et le velouté de potimarron restent proposés. Les carottes restent disponibles toute l'année dans les données ; leur disponibilité n'est pas déclarée fausse. Betterave et chou-fleur suivent désormais les mêmes repères nationaux sur tous les appareils, quel que soit leur ancien réglage régional.

Le nombre de résultats figure près du bouton, dans le libellé « En ce moment · octobre · … recettes de saison », y compris dans un univers ou une recherche. Il s'actualise avec les autres filtres et est annoncé comme statut accessible. L'explication détaillée reste repliée : choix Apple Design de retour discret, sans écran ou contrôle supplémentaire. Désactiver le filtre retrouve tous les plats ; aucune recette enregistrée ni repas du planning n'est modifié. **Une mise à jour de l'application suffit, sans réimporter les recettes déjà présentes.**

## Références et avis

Les pages originales de **Marmiton** consultées le 12 octobre 2026 affichent les notes et nombres de commentaires suivants. Ce sont des indications communautaires, susceptibles d'évoluer, pas une certification culinaire.

| Adaptation Manger! | Référence consultée | Note de la source | Commentaires affichés |
| --- | --- | --- | --- |
| Risotto crémeux aux asperges | [Risotto aux asperges](https://www.marmiton.org/recettes/recette_risotto-aux-asperges_70270.aspx) | 4,7/5 | 43 |
| Tian de légumes d’été | [Tian provençal](https://www.marmiton.org/recettes/recette_tian-provencal_36194.aspx) | 4,7/5 | 163 |
| Velouté de potimarron et pommes de terre | [Soupe veloutée de potimarron et pommes de terre](https://www.marmiton.org/recettes/recette_soupe-veloutee-de-potimarron-et-pommes-de-terre_41161.aspx) | 4,9/5 | 298 |
| Endives au jambon gratinées | [Endives au jambon](https://www.marmiton.org/recettes/recette_endives-au-jambon_25868.aspx) | 4,5/5 | 109 |

Les **versions Manger! sont des adaptations**, avec textes originaux, quantités pour deux portions, durées indicatives et lien `sourceUrl` conservé dans la fiche. Les textes, photos et avis des contributeurs ne sont pas copiés. Les notes ci-dessus ne sont ni attribuées à ces adaptations ni enregistrées comme avis du foyer. Les descriptions originales de Manger! restent sous CC0 ; cela ne change pas les droits sur les contenus des sites référencés.

Le risotto est adapté sans parmesan, avec crème et bouillon végétal ; le tian utilise de l'huile plutôt que du beurre ; le velouté utilise un bouillon végétal plutôt que de volaille. Le gratin comporte du jambon cuit et reste omnivore. Les étapes donnent des repères de tendreté pour ajuster la cuisson : en particulier la page du tian affiche des durées contradictoires, donc la version Manger! propose une estimation explicite avec vérification de l'aubergine. Le tian est un accompagnement, le velouté une soupe : aucune promesse de repas nutritionnellement complet.

**Pas d'essai culinaire de ces adaptations effectué.** Les bonnes notes concernent exclusivement les recettes de référence. Aucun test réel nouveau sur Safari/iPhone, Android ou le serveur Ubuntu.

## Vérification locale

Résultat du 2 novembre : 19/19 tests ciblés (filtre, module et catalogue) et 429/429 tests généraux réussis, aucun ignoré. Le rendu réel de la fonction de filtrage est exercé dans un DOM simulé avec cinq anciens choix locaux : mêmes résultats nationaux, recettes du Nord et bretonnes ensemble, plat d’été exclu en octobre. Aucun nouvel essai graphique iPhone/Android, Docker Linux ou changement d’horloge réelle revendiqué.

Historique du 12 octobre : tests du catalogue, quatre mois représentatifs et ajout d’un légume hors saison ; import depuis 34 recettes avec personnalisations préservées et réimport sans doublon. Le parcours Chromium isolé de ce lot portait sur les trois anciens calendriers ; il n’établit pas une validation visuelle de la simplification actuelle. Pour une instance Docker, reconstruire et déployer l’image applicative selon [l’entretien du projet PostgreSQL retenu](POSTGRESQL-ADMIN.md#9-mise-à-jour-et-entretien), sans relancer la migration ni le Compose SQLite standard. Les images d’outils et le schéma ne changent pas pour ce lot.
