# Suite du développement

Contrainte produit : trois onglets, actions dans leur contexte, options secondaires repliées ; préserver une interface sobre en clair et en sombre, au clavier et dès 320 px.

## Lot implémenté — septembre 2026

- Photos personnelles, miniatures et fiche illustrée ; édition et copie.
- Placard avec déduction des courses et réservation chronologique entre semaines.
- Restes de recettes communes sans variantes individuelles, comptés au jour de préparation.
- Regroupement des unités compatibles et de variantes explicites de noms d'ingrédients.
- Avis et notes du foyer sur les recettes.
- Déplacement et copie de repas sans écraser les créneaux occupés.
- Mode cuisine : son optionnel et maintien de l'écran selon le navigateur.

Vérification : tests Node et parcours navigateur sur base isolée. Le rendu a été contrôlé à 320, 390 et 760 px, en clair et en sombre. L'audio et le maintien de l'écran ont été contrôlés avec des API simulées ; un essai sur téléphone reste nécessaire.

## À poursuivre

- Enrichissement du catalogue, puis validation des recettes en cuisine.
- Anti-gaspi : dates de péremption et suggestions fondées sur les stocks.
- Coût indicatif des recettes et de la semaine à partir de prix renseignés.
- Saisonnalité selon la région choisie.
- Semaines types réutilisables ; variantes individuelles pour les restes.
- Installation mobile et consultation hors connexion.
- Comptes, invitations et isolation des foyers.
- Synchronisation des courses sans rechargement manuel.
- Sauvegarde complète et restauration depuis l'application.
- Carte des restaurants intégrée.
- Image Docker versionnée publiée.

L'export JSON de recettes ne remplace pas la sauvegarde du foyer et n'inclut pas les photos ni les avis. L'application ne doit pas être exposée directement à Internet avant la mise en place d'un accès protégé.
