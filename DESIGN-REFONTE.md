# Proposition de refonte de Manger!

Statut : **maquette validée ; première intégration mobile sur `development`**. La navigation Semaine / Recettes / Courses / Compte, les assiettes séparées, les thèmes Potager / Ardoise / Prune, les cartes de recettes et l'action « Planifier ce repas » sont intégrés. Les photos ne s'affichent que lorsqu'une recette en possède réellement une. Les captures Jow fournies en septembre 2026 servent de référence pour la lisibilité et le parcours guidé, pas de modèle à reproduire écran par écran. Référence publique : https://jow.fr/pages/misc/jow-comment-ca-marche.

À poursuivre : contrôle humain sur iPhone Safari et Android après déploiement, finition des filtres de découverte et de la fiche, puis vraie adaptation tablette/PC. Les tests locaux ne valident pas ces environnements distants.

## Intention

Sur téléphone, répondre vite à « On mange quoi ? », puis passer du repas prévu aux courses et à la préparation sans ressaisie. Le signe distinctif de Manger! reste le **repas de foyer** : une même table peut réunir des régimes et des assiettes différents, une sortie ou un date. L'identité visuelle doit être chaleureuse et culinaire, mais les commandes restent sobres.

## Ce que précisent les six nouvelles captures Jow

- **Accueil** : deux grandes portes d'entrée et des images de plats donnent immédiatement envie d'agir. Pour Manger!, proposer « Composer ma semaine » et « Ouvrir les courses », sans bannières commerciales ni notifications promotionnelles.
- **Explorer** : recherche visible dès l'arrivée, recette mise en avant avec une grande photo, puis quelques univers illustrés. Garder la recherche accessible et limiter les univers affichés avant « Voir tout » ; les catégories de Manger! incluent notamment les recettes économiques, de date et par cuisine.
- **Collections de recettes** : photos généreuses, titre court et action « Planifier » près de chaque plat. Ne pas multiplier les carrousels imbriqués : un seul espace à défilement horizontal clairement signalé au maximum, puis une grille ou liste verticale facile à parcourir.
- **Profil** : les captures montrent des recettes à faire, listes de courses et collections sauvegardées. Dans Manger!, ces informations existent déjà dans Semaine, Courses et les favoris ; le foyer sert surtout aux personnes, goûts et réglages, sans recopier les mêmes cartes partout.
- **Ambiance** : surfaces sombres calmes et photographie culinaire très présente. Faire la première maquette en mode sombre avec l'accent vert de Manger!, puis vérifier le mode clair ; l'apparence finale suit le téléphone, pas un thème sombre imposé.

## Écrans à maquettiser avant de coder

1. **Semaine** : jours faciles à parcourir, repas de midi/soir en cartes, personnes visibles sans surcharger, action principale « Choisir un repas ». Une sortie ou un date garde un traitement distinct d'une recette.
2. **Recettes** : recherche immédiatement visible, univers sous forme de filtres légers, grandes images pour les recettes qui en ont une, substitut graphique soigné et discret pour les autres. Pas de carte vide ni d'image artificielle présentée comme une vraie photo du plat.
3. **Fiche recette** : titre, temps, portions, ingrédients quantifiés, étapes lisibles une par une, puis action « Planifier ». Les éventuels avis du foyer restent secondaires. Ne pas afficher de calories ou de valeurs nutritionnelles non calculées et vérifiées.
4. **Courses** : quantités et rayons au premier plan, articles cochés repliés, partage accessible, placard en action secondaire. Garder le suivi utilisable d'une main.
5. **Foyer** : profils et goûts par personne, réglages peu fréquents hors de la navigation principale. Une configuration guidée et facultative peut aider un nouveau foyer à saisir régimes et exclusions ; demander les équipements seulement si les recettes savent réellement en tenir compte.

Navigation compacte validée : **Semaine · Recettes · Courses · Compte**. Le foyer reste accessible depuis l'en-tête et l'onglet Compte. Tablette/PC : mêmes contenus, disposition adaptée plus tard ; ne pas agrandir simplement les cartes mobiles.

Schéma compact pour la découverte des recettes :

```text
Recettes                         Foyer
[ Rechercher une recette…          ]
Suggestion du moment · grande photo
[ Planifier ]
Univers : Économique · Date · Japon · …  Voir tout
Plats du foyer · cartes photo / substitut
Navigation Semaine / Recettes / Courses
```

## Direction visuelle proposée

Identité par défaut « **Potager** » : fond clair `#F7F8F3`, surface `#FFFFFF`, texte `#1C2A22`, texte secondaire `#56645A`, accent `#1B6B4A`, séparateur `#DCE5DC`. Le texte principal sur fond clair atteint environ **14,0:1** ; le texte secondaire **5,9:1** ; le blanc sur l'accent **6,5:1**.

Mode sombre correspondant : fond `#111916`, surface `#1B2821`, texte `#F4F7F2`, secondaire `#B6C7BB`, accent `#7BD5A2`, séparateur `#33463A`. Le texte principal sur fond sombre atteint environ **16,6:1** ; le texte secondaire **10,1:1** ; le texte foncé `#10231A` sur l'accent **9,3:1**. Ces valeurs concernent les couleurs pleines citées, pas les photos ou les superpositions ; celles-ci seront contrôlées sur les maquettes réelles.

À terme, trois accents présélectionnés maximum, sans roue chromatique ni réglage par composant : **Potager** `#1B6B4A`, **Ardoise** `#3B5F9B`, **Prune** `#8B4B56` en mode clair (blanc sur chacun : au moins **6,3:1**). Chaque accent devra avoir sa variante sombre validée. Le choix d'accent ne change ni les couleurs d'alerte, ni les régimes, ni les informations de sécurité. Il peut rester local à l'appareil pour ne pas modifier la vue des autres membres du foyer.

Typographie : police système pour toute l'application ; titres de page autour de 28 px / 700, titres de recettes autour de 22 px / 700, corps autour de 16–17 px / 400, métadonnées autour de 14 px / 500. Garder des boutons et cases d'au moins 44 × 44 px, une hiérarchie lisible avec le texte agrandi, et une navigation au clavier. Photos et accents portent la personnalité ; pas besoin d'une seconde police pour lancer la refonte.

Schéma compact de la fiche :

```text
Photo (ou illustration neutre)      ♡
Nom du plat
Durée · portions · compatibilité
Ingrédients
Liste quantifiée
Étapes
1 · Préparer…   2 · Cuire…
[ Planifier ce repas ]
Navigation Semaine / Recettes / Courses
```

Sur grand écran, la photo et la fiche peuvent se placer côte à côte, avec une largeur de lecture limitée pour les étapes ; aucune information supplémentaire n'est requise simplement parce que l'écran est large.

## Garde-fous

- La refonte est **visuelle et ergonomique d'abord** : conserver recettes, planning, courses, comptes et données SQLite. Pas de migration de données pour changer une couleur ou un composant.
- Maquette de Semaine, Recettes, fiche et Courses avant développement ; faire valider le rendu sur téléphone, puis intégrer par écran sans remplacer tout d'un coup.
- Vérifier Safari iPhone et Android, 320–430 px, texte agrandi, contraste, focus clavier et modes clair/sombre. Les commandes ne doivent pas se chevaucher ni masquer le contenu sous la navigation.
- Éviter la copie des illustrations, formulations, icônes, photos et écrans Jow. Son parcours recette → menu → courses est une inspiration ; Manger! doit rester reconnaissable et librement auto-hébergeable.
- Les photos culinaires doivent provenir des utilisateurs ou d'une source réutilisable avec droits vérifiés ; aucune photo Jow ni lien direct vers ses médias. Sans photo, montrer un substitut cohérent plutôt qu'une image trompeuse.
- Ne pas ajouter un tutoriel obligatoire, un onglet « Plus », des animations gratuites ou des options de thème dans chaque écran. Une transition courte à l'ouverture de la fiche suffit si elle aide à suivre le contexte ; respecter la réduction des animations.

La maquette mobile a été validée avant l'intégration. Les équipements et données nutritionnelles demanderaient un chantier fonctionnel séparé avant d'apparaître dans la fiche.
