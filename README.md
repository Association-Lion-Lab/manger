# Manger!

> On mange quoi cette semaine ?

**Manger!** est un planificateur de repas libre et auto-hébergeable. Il rassemble les recettes, les repas à la maison, les sorties, les rendez-vous et la liste de courses dans un même calendrier.

## État du projet

La maquette mobile du calendrier est validée. Une première tranche fonctionnelle permet de planifier des recettes, des sorties et des dates, puis de générer la liste de courses correspondante. Les foyers mixtes peuvent enregistrer les régimes de leurs membres, attribuer une protéine compatible à chacun autour d'une base commune ou coordonner deux recettes différentes.

## Lancer localement

Depuis une fiche recette, **Cuisiner cette recette** ouvre les étapes guidées et les ingrédients. Chaque étape chronométrée dispose d'un minuteur indépendant : démarrer, mettre en pause, reprendre et réinitialiser. Passer à une autre étape ne l'arrête pas. Quitter le mode cuisine annule les minuteurs. « Confort de cuisine » propose un son optionnel en fin de minuteur et le maintien de l'écran allumé, selon les autorisations du navigateur. Ces options utilisent les API natives [Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) et [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext), sans dépendance. Les alertes peuvent être retardées en arrière-plan ; aucune notification système n'est envoyée. Les durées servent de repères, pas de garantie de cuisson.

Le nombre de portions est ajustable de 1 à 100 dans la fiche et le mode cuisine : les ingrédients sont recalculés sans modifier la recette, le planning ou les courses. Les instructions rédigées et les durées ne sont pas recalculées automatiquement ; adaptez la cuisson si nécessaire. Changer les portions ne réinitialise pas les minuteurs.

Prérequis : Node.js 24 ou plus récent. Aucune dépendance n'est à installer.
Depuis la fiche recette, « Imprimer / PDF » ouvre l'impression du navigateur : sélectionnez votre imprimante ou l'enregistrement en PDF. La fiche contient les ingrédients pour les portions choisies, les étapes et le lien source éventuel. Les durées et instructions restent celles de la recette d'origine.

```shell
npm start
```

Ouvrez ensuite <http://localhost:3000>. Les données sont conservées dans `data/manger.db`.

```shell
npm test
```

## Docker

```shell
docker compose up -d --build
```

L'application est ensuite disponible sur <http://localhost:3000>. Le volume Docker `manger-data` conserve la base SQLite entre les mises à jour.

## Principes

L'interface conserve trois onglets. Les actions secondaires des recettes sont regroupées dans « Plus d'options » ; les notes et les options de cuisine sont repliées par défaut. Les contrastes des boutons principaux sont corrigés en clair et en sombre.

Une photo personnelle peut être ajoutée depuis l'éditeur, dans « Photo du plat ». JPEG, PNG ou WebP jusqu'à 10 Mo : le navigateur redimensionne à 960 pixels maximum puis convertit en JPEG avant envoi (400 000 caractères maximum pour la donnée encodée). Les photos sont conservées dans SQLite, chargées séparément et copiées avec les variantes. La suppression de la photo prend effet à l'enregistrement. Aucune photographie n'est importée automatiquement depuis un site tiers.

« Mon avis et mes notes » enregistre une appréciation de 1 à 5 (ou aucune note) et un commentaire de 2 000 caractères maximum, communs au foyer. Modifier une recette conserve cet avis ; dupliquer une recette ne le copie pas.

Une fiche recette permet d'ajouter ou retirer un favori. « Mes favoris » dans le filtre Univers du catalogue et du choix des plats affiche uniquement ces recettes. Les favoris sont communs au foyer et persistants, sans changer les règles de régime ni les ingrédients des courses.

Dans « Mon foyer », les goûts permettent d'éviter jusqu'à 50 mots ou expressions dans les noms d'ingrédients déclarés. Le filtre ignore la casse et les accents et s'applique aux suggestions ainsi qu'à la composition automatique d'une semaine. Il ne masque pas le catalogue et n'empêche pas de choisir manuellement un plat. Ce n'est pas une protection contre les allergies : ingrédients cachés, synonymes, traces et contaminations croisées ne sont pas détectés. Une liste vide efface ces préférences.

## Importer et exporter des recettes

Dans l'onglet Recettes, le bouton ⇩ ouvre l'import par lien ou fichier. « Exporter mes recettes (JSON) » télécharge les recettes, leurs ingrédients, étapes et liens source au format `manger-recipes` version 1. Ce fichier ne sauvegarde pas le foyer, les favoris, les protéines, le calendrier ou les courses.

L'import d'un fichier (1 Mo, 1 à 200 recettes) valide les données puis permet de choisir une recette à relire dans l'éditeur. Il crée une nouvelle recette : aucun remplacement ni import en masse. Les anciennes recettes sans étapes restent des brouillons à compléter avant enregistrement. Il est possible de renommer le brouillon pour éviter des titres identiques.

L'import internet consulte la page depuis votre serveur et lit les blocs JSON-LD Schema.org `Recipe`. Il n'exécute pas JavaScript et ne télécharge pas les photographies. HTTPS public sur le port 443 et IPv4 uniquement : les adresses locales, privées et réservées sont refusées, chaque redirection est revérifiée et l'adresse DNS validée est épinglée à la connexion. Limites : 15 secondes, 3 redirections, 1,5 Mo par page, un téléchargement à la fois. Les sites sans données structurées, bloqués ou nécessitant une connexion peuvent être incompatibles ; aucun contournement n'est effectué.

La relecture est obligatoire dans l'interface. Les fractions et unités courantes sont reconnues partiellement ; les unités non reconnues sont laissées à remplir. Portions et durée absentes ou ambiguës sont signalées, avec valeurs provisoires de 2 portions et 30 min. Le régime proposé reste omnivore à vérifier, les étapes sont classées en préparation sans minuteurs automatiques, et les instructions ne sont ni traduites ni recalculées. Le lien de la source est conservé et visible dans la fiche : les recettes importées ne deviennent pas des contenus CC0 de Manger!.

Cette version ne dispose pas encore d'authentification : ne l'exposez pas directement sur Internet. Utilisez un réseau de confiance ou un accès protégé en amont. L'export de recettes JSON n'inclut pas les photos ni les avis du foyer ; conservez la base SQLite pour une sauvegarde complète, serveur arrêté.

## Courses et organisation

« Mon placard » permet d'indiquer les quantités disponibles aujourd'hui et de les corriger ou retirer. Les courses calculées déduisent ce stock : les besoins des repas précédant la semaine affichée sont réservés en premier, pour ne pas réutiliser le même stock sur plusieurs semaines. Les repas antérieurs à la mise à jour du stock ne sont pas déduits. Le stock restant est une estimation fondée sur le planning, pas une confirmation de consommation : ajustez-le après avoir cuisiné, jeté ou racheté un aliment. Une nouvelle saisie du même aliment remplace sa quantité, elle ne s'y ajoute pas. Les articles de courses manuels restent indépendants. Dates de péremption et suggestions fondées sur le placard restent à développer.

Les ingrédients calculés regroupent désormais les unités compatibles (g/kg, ml/cl/dl/l) et une liste explicite de variantes de noms (par exemple œuf/oeufs ou tomate/tomates). Ils ne confondent pas masse et volume, ni tomate et tomate concassée. Les corrections de rayon et les cases cochées suivent ces regroupements. Les synonymes non référencés et les articles ajoutés manuellement ne sont pas fusionnés.

Les courses combinent les ingrédients calculés depuis le planning et des articles ajoutés manuellement pour la semaine affichée. Les ajouts peuvent être cochés, supprimés et partagés avec la liste. Leur rayon est choisi à l'ajout ; celui des ingrédients est estimé par mots-clés et peut être approximatif. Les ajouts ne sont ni fusionnés avec les ingrédients ni effacés lorsqu'un repas change.

Dans les courses, « Organiser les rayons » affiche une poignée ⠿ par article. Glissez-la à la souris ou au toucher vers un rayon (les destinations restent visibles en haut), ou activez-la par toucher, Entrée ou Espace pour choisir le rayon dans une fenêtre. « Terminer » retrouve la liste épurée. Chaque correction est enregistrée immédiatement. Pour un ingrédient calculé, ce choix est retenu pour l'aliment et ses unités compatibles dans toutes les semaines ; « Automatique » retire la correction. Pour un article ajouté manuellement, seul cet article est modifié. Le déplacement change le rayon, pas l'ordre des articles à l'intérieur d'un rayon.

## Restes et déplacements du planning

Depuis un repas avec une recette commune sans variantes individuelles, « Prévoir des restes » ajoute un repas ultérieur dans un créneau libre. Les portions supplémentaires sont comptées à la date où l'on cuisine, y compris si les restes sont prévus la semaine suivante. La fiche ouverte depuis le planning affiche la quantité totale à préparer. Les régimes et suppléments individuels ne sont pas encore répartis dans ce parcours ; choisissez un repas commun sans variantes pour l'utiliser. Le choix de la date ne garantit pas la conservation du plat.

Un repas source ne peut pas être remplacé ni supprimé tant que des restes lui sont liés. Retirer les restes réduit automatiquement les quantités à préparer. « Déplacer ou copier » conserve la répartition du repas et refuse les créneaux occupés. Un déplacement respecte l'ordre préparation/restes. Copier un repas cuisiné copie seulement ce repas ; pour ajouter des restes, utilisez l'action dédiée depuis la source.

## Engagements

- auto-hébergeable avec une installation Docker simple ;
- utilisable confortablement depuis un téléphone ;
- aucune dépendance obligatoire à un service cloud ou à une IA ;
- données exportables et sans verrouillage propriétaire ;
- recommandations explicables à partir des préférences du foyer ;
- recettes privées par défaut.

## MVP

La version `0.1` devra permettre de :

1. créer et modifier ses propres recettes avec des étapes de préparation, cuisson, repos et dressage ;
2. consulter une petite base interne de recettes libres ;
3. obtenir des suggestions selon les préférences, le temps disponible et les repas récents ;
4. placer un repas dans un calendrier hebdomadaire ;
5. indiquer un repas à l'extérieur ou au restaurant ;
6. marquer une occasion comme un date ou un repas avec des invités ;
7. générer une liste de courses depuis les recettes planifiées ;
8. cocher, copier et partager cette liste depuis l'application.
9. adapter un repas partagé aux régimes des membres du foyer avec des protéines explicitement compatibles.

## Modèle fonctionnel

Un élément du calendrier est un **repas planifié**. Il combine :

- une date et un moment de la journée ;
- un lieu : maison, extérieur ou restaurant ;
- une occasion : ordinaire, date ou invités ;
- un nombre de personnes ;
- zéro, une ou plusieurs recettes ;
- un restaurant facultatif ;
- une note facultative.

Un date n'est donc pas un type de repas fermé : il peut avoir lieu au restaurant ou autour d'une recette cuisinée à la maison.

## Recommandations v1

La version `0.1` n'utilise pas d'IA. Son classement est déterministe et explicable :

1. favoriser les recettes qui réutilisent les ingrédients déjà prévus dans la semaine ;
2. proposer les recettes non encore planifiées avant les répétitions ;
3. pénaliser les plats mangés récemment ;
4. départager les égalités par ordre alphabétique.

Les allergies, préférences et contraintes de matériel enrichiront ce classement lorsqu'elles seront enregistrables dans les profils.

## Restaurants autour de soi

Les repas au restaurant et les dates peuvent rechercher jusqu'à huit restaurants OpenStreetMap dans un rayon de 3 km, classés par distance. Cliquer sur un résultat remplit le nom du repas ; aucune réservation n'est effectuée.

Cette fonction est optionnelle. Après un clic explicite et l'autorisation de géolocalisation du navigateur, les coordonnées sont transmises au serveur Manger puis à l'API publique Overpass ; Manger ne les enregistre pas. Les données OpenStreetMap peuvent être incomplètes ou anciennes. Vérifiez directement les horaires et le menu du restaurant.

La géolocalisation nécessite HTTPS, sauf sur `localhost`. Pour utiliser une autre instance Overpass, définissez `MANGER_OVERPASS_URL` avec son URL d'API. La planification manuelle reste disponible sans ce service.

En cas de géolocalisation indisponible, saisissez une ville ou un code postal français et choisissez la commune. La recherche est alors centrée sur cette commune. Cette saisie est transmise à l'API officielle `geo.api.gouv.fr`, configurable via `MANGER_COMMUNES_URL`. Les résultats affichent l'adresse lorsqu'elle est renseignée et proposent un lien vers la carte OpenStreetMap.

## Composer sa semaine

Dans Semaine, « Compose ma semaine » propose un menu pour les créneaux libres sélectionnés. Choisissez le temps maximum et les participants (une portion chacun), ou le nombre de personnes si aucun foyer n'est configuré. La base commune respecte les régimes des participants ; cette première version n'ajoute pas de supplément de protéine. Les variantes par personne restent disponibles dans l'ajout manuel.

L'aperçu ne modifie rien : chaque plat peut être remplacé avant validation. Le classement privilégie la variété, puis les ingrédients communs avec les courses de la semaine et les plats proposés. Ce rapprochement par noms n'est ni une estimation de prix ni un calcul de stock. Un catalogue limité peut entraîner des répétitions. Modifier les critères invalide l'aperçu.

La validation ajoute tous les repas et met à jour les courses. Si un créneau a été rempli entre-temps, aucun repas du menu n'est enregistré : fermez le formulaire et recomposez. Les repas existants ne sont jamais remplacés par cet outil.

## Catalogue et univers

Depuis une fiche, « Dupliquer » ouvre une copie dans l'éditeur avec ses ingrédients, étapes et univers. La variante n'est créée qu'à l'enregistrement et ne modifie pas l'original ; annuler ne crée aucune recette.

Dans Recettes, le bouton d'import ajoute 14 recettes originales avec ingrédients quantifiés et étapes de préparation, cuisson et service. L'import conserve les recettes existantes et ignore les titres déjà présents. Les recettes importées restent modifiables et alimentent les suggestions et la liste de courses.

La recherche porte sur le nom et les ingrédients. Les univers sont combinables dans l'éditeur : Recettes du rat (budget), Recettes de date, Plats mijotés, Japon, Chine, Terroir français et Côté chef. « Budget » ne garantit pas un prix ; « Côté chef » désigne une inspiration soignée, sans attribution à un chef connu. Les recettes n'ont pas encore été validées par des essais en cuisine.

Huit univers supplémentaires sont disponibles : Express (30 min maximum), Batch cooking, À emporter, Doudou food, Méditerranée, Italie, Inde et Mexique. Ils se choisissent dans l'éditeur et le filtre de recettes. Les prochains imports du catalogue incluent les nouvelles étiquettes pertinentes ; les recettes déjà importées restent inchangées et peuvent être classées manuellement. Mexique est disponible pour vos créations, sans recette dédiée dans ce premier catalogue. Les étiquettes de conservation ne remplacent pas les précautions de refroidissement, de transport et de réchauffage.

## Parcours de validation `0.1`

Une personne doit pouvoir ajouter trois recettes, demander des suggestions, organiser sa semaine, noter une sortie et un date, puis obtenir la liste de courses correspondante sans ressaisir les ingrédients.

## Pas dans la version `0.1`

- commande directe chez les grandes enseignes ;
- comparaison des prix en temps réel ;
- réservation de restaurant ;
- application mobile native ;
- réseau social de recettes ;
- génération de recettes par IA ;
- calcul nutritionnel avancé.

Ces fonctions ne seront considérées qu'après validation du parcours principal.

## Premiers jalons

- [x] Valider la présente définition du MVP.
- [x] Produire une maquette mobile du calendrier hebdomadaire.
- [x] Choisir la stack à partir de cette maquette.
- [x] Implémenter la création et la modification des recettes.
- [x] Terminer le parcours de validation `0.1`.
- [ ] Publier une image Docker versionnée.

## Identité

- Nom public : **Manger!**
- Nom technique : `manger`
- Description : **Planificateur de repas libre et auto-hébergeable**
- Accroche : **Recettes, sorties et courses. Toute votre semaine à table.**

## Licence

Le code de **Manger!** est distribué sous licence [GNU AGPL-3.0-or-later](LICENSE). Les descriptions et données des 14 recettes originales de `catalog.js` sont dédiées au domaine public sous [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/). Aucune recette ni photographie de Jow n'est reprise. Les contenus ajoutés par les utilisateurs restent sous leur responsabilité.
