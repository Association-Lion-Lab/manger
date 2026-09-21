# Suite du développement

Contrainte produit : trois onglets, actions dans leur contexte, options secondaires repliées ; préserver une interface sobre en clair et en sombre, au clavier et dès 320 px.

## Lot implémenté — septembre 2026

- Photos personnelles, miniatures et fiche illustrée ; édition et copie.
- Placard avec déduction des courses et réservation chronologique entre semaines.
- Restes de recettes communes ou d'assiettes individuelles, comptés au jour de préparation.
- Regroupement des unités compatibles et de variantes explicites de noms d'ingrédients.
- Avis et notes du foyer sur les recettes.
- Déplacement et copie de repas sans écraser les créneaux occupés.
- Mode cuisine : son optionnel et maintien de l'écran selon le navigateur.
- Courses : rafraîchissement automatique toutes les 15 secondes dans l'onglet visible, avec protection des actions et saisies locales.
- Sauvegarde complète téléchargeable ; vérification et restauration vers un nouveau fichier en ligne de commande, sans écrasement de la base active.
- Copie d'une semaine avec aperçu, variantes individuelles, liens de restes internes et refus des conflits.
- Recherche de recettes tolérant accents, pluriels connus et petites fautes en l'absence de correspondance exacte.
- Menu automatique anti-gaspi : quantités et dates du placard, réservations existantes et consommation virtuelle chronologique de l'aperçu.
- Semaines types nommées : enregistrement, application sans écrasement et suppression indépendante du calendrier.

Vérification : tests Node et parcours navigateur sur base isolée. Le rendu a été contrôlé à 320, 390 et 760 px, en clair et en sombre. L'audio et le maintien de l'écran ont été contrôlés avec des API simulées ; un essai sur téléphone reste nécessaire.

## P1 — Fiabiliser et préserver le travail

- Enregistrer les modifications dans Git et les pousser sur Codeberg, branche development.
- Corriger les bugs bloquants et les chevauchements ; vérifier les parcours sur téléphone réel, notamment minuteurs, son et maintien de l'écran.
- Restauration guidée ajoutée : aperçu, confirmation, copie de récupération et transaction. Tests sur base isolée ; ne pas tester par remplacement du foyer réel.
- Docker préparé : image locale versionnée, contrôle de santé et procédure d'installation vierge. Construction réelle et publication à faire sur une machine équipée de Docker (absent du PC de développement).
- Tests téléphone différés jusqu'à cette installation Docker ; HTTPS nécessaire pour vérifier le maintien de l'écran et la géolocalisation.

## P2 — Améliorer l'usage quotidien

- Compléter l'anti-gaspi : plusieurs lots par aliment et recomposition après remplacement manuel d'un plat. Les quantités, dates et réservations du placard sont déjà prises en compte dans les suggestions et le menu automatique.
- Gérer les restes d'une base commune avec suppléments de protéines différents.
- Enrichir le catalogue et valider les recettes en cuisine.
- Permettre l'installation mobile et la consultation hors connexion.
- Ajouter les comptes, invitations et l'isolation des foyers. À avancer en P1 si une ouverture à plusieurs foyers ou sur Internet devient l'objectif immédiat.

## P3 — Évolutions différées

- Concevoir les interfaces tablette et PC : exploiter la largeur pour le planning et les recettes, adapter la navigation au tactile et au clavier/souris. Les contrôles actuels de largeur ne constituent pas encore ces interfaces.
- Revoir « Plus d’options », jugé peu pratique, et rendre les fonctions fréquentes plus accessibles sans surcharger l'écran.
- Ajouter le coût indicatif des recettes et de la semaine à partir de prix renseignés.
- Ajouter la saisonnalité selon la région choisie.
- Intégrer une carte des restaurants.

Ordre de travail : P1, puis P2, puis P3. Les interfaces tablette/PC et la révision de « Plus d’options » restent différées à la demande de l'utilisateur ; les défauts visuels qui gênent l'utilisation restent P1.

L'export JSON de recettes ne remplace pas la sauvegarde du foyer et n'inclut pas les photos ni les avis. L'application ne doit pas être exposée directement à Internet avant la mise en place d'un accès protégé.
