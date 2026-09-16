# Manger!

> On mange quoi cette semaine ?

**Manger!** est un planificateur de repas libre et auto-hébergeable. Il rassemble les recettes, les repas à la maison, les sorties, les rendez-vous et la liste de courses dans un même calendrier.

## État du projet

La maquette mobile du calendrier est validée. Une première tranche fonctionnelle permet de planifier des recettes, des sorties et des dates, puis de générer la liste de courses correspondante. Les foyers mixtes peuvent enregistrer les régimes de leurs membres, attribuer une protéine compatible à chacun autour d'une base commune ou coordonner deux recettes différentes.

## Lancer localement

Prérequis : Node.js 24 ou plus récent. Aucune dépendance n'est à installer.

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

Le code de **Manger!** est distribué sous licence [GNU AGPL-3.0-or-later](LICENSE). Les licences applicables aux recettes et aux médias seront précisées séparément avant leur ajout au projet.
