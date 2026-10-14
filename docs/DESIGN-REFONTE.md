# Proposition de refonte de Manger!

Ce document conserve la proposition, les décisions visuelles et leur état d'intégration. Les passages prospectifs sont des intentions, pas des fonctions promises. Voir [l'état fonctionnel actuel](FONCTIONNALITES.md) et [les choix et limites](DECISIONS.md).

Statut : **maquette validée ; première intégration mobile sur `development`**. La navigation Semaine / Recettes / Courses / Compte, les assiettes séparées, les thèmes Potager / Ardoise / Prune, les cartes de recettes et l'action « Planifier ce repas » sont intégrés. Les photos ne s'affichent que lorsqu'une recette en possède réellement une. Les captures Jow fournies en septembre 2026 servent de référence pour la lisibilité et le parcours guidé, pas de modèle à reproduire écran par écran. Référence publique : https://jow.fr/pages/misc/jow-comment-ca-marche.

À poursuivre : contrôle humain sur iPhone Safari et Android après déploiement, ajustements issus de ces essais, puis vraie adaptation tablette/PC. Les tests locaux ne valident pas ces environnements distants.

Filtres affinés le 9 octobre : recherche conservée au premier plan, durée native et De saison sur une même rangée qui se replie quand la largeur ou le texte l'exige. Mois sur sa propre ligne après activation ; coche en plus de la couleur pour le filtre actif. Réinitialisation facultative et contextuelle, sans quitter l'univers ou les favoris ni ajouter un dialogue. Les principes de portée explicite de recherche (`searching.md › Best practices`) et d'état perceptible (`toggles.md › Best practices`) d'Apple Design guident ce traitement web ; la palette existante reste inchangée. Contrôles Chromium locaux, validation sur appareil réel à effectuer.

Finition de la fiche intégrée le 9 octobre : fermeture et favoris dans une barre opaque persistante, photos réelles inchangées, titre sur toute la largeur, portions compactes, Planifier/Cuisiner avant les ingrédients et étapes. Les quantités sont séparées par des lignes discrètes ; les étapes restent numérotées et les actions de gestion secondaires restent repliées. Palette et contrastes ci-dessous réutilisés, sans animation ajoutée ni nouvel écran. Les principes de lisibilité, regroupement et sortie de modal d'Apple Design sont appliqués à des contrôles web natifs, pas présentés comme une interface iOS native. Tests Chromium et texte agrandi locaux ; contrôle humain iPhone/Android toujours requis.

## Intention

Correction demandée après la finition du 14 octobre 2026 : les SVG restent réservés aux commandes, menus et compte ; les univers retrouvent leurs émojis à 28 px et les régimes gardent les leurs. Les libellés restent visibles. Cette règle remplace les pictogrammes d'univers SVG décrits dans le lot historique ci-dessous. Une photo personnelle disponible est prioritaire dans les cartes de recette et le calendrier à la maison, y compris dates, invités, restes et assiettes séparées ; le substitut s'affiche uniquement sans photo. Le logo de Manger! n'est pas une illustration de plat.

Finition des icônes du **14 octobre 2026** : famille SVG locale sur grille 24 × 24, traits arrondis de 1,8, taille d'action 22 px et pictogrammes d'univers 30 px. Fermeture, ajout, import/export/partage, saison, compte, menus de repas, retour et favoris partagent ce dessin. Les quatre icônes de navigation conservent leurs formes et leur épaisseur est harmonisée. Deux assiettes pour les plats séparés, casserole pour cuisiner, épingle pour une sortie, cœur pour un date et personnes pour les invités. Les univers restent nommés : les cuisines peuvent partager un dessin culinaire sans perdre leur distinction textuelle. Budget illustré par des pièces, pas par le logo du rat. L'état favori garde un cœur rempli en plus de `aria-pressed`. Icones décoratives masquées aux lecteurs d'écran, noms des actions conservés ; les cibles tactiles restent au moins 44 px. Aucun nouvel écran, couleur, animation, police ou paquet ; les photos, illustrations de plats et le logo sont inchangés. Les symboles des options natives et du parcours de régime ne sont pas remplacés dans ce lot.

Apple Design : `icons.md › Best practices` pour taille, épaisseur et métaphores cohérentes, SVG vectoriels et noms accessibles. Les principes sont adaptés à une interface web, sans prétendre fournir des SF Symbols ou une application iOS native. Captures des menus, Recettes, Compte et univers inspectées ; contrôle Chromium sur cinq largeurs en clair/sombre et texte à 200 %. Validation réelle sur appareil à effectuer après la mise à jour.

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

Navigation compacte validée : **Semaine · Recettes · Courses · Compte**. Le foyer est accessible depuis l'onglet Compte ; le raccourci redondant de l'en-tête a été retiré. Tablette/PC : mêmes contenus, disposition adaptée plus tard ; ne pas agrandir simplement les cartes mobiles.

Schéma compact pour la découverte des recettes :

```text
Explorer les recettes             Importer  Ajouter
[ Un plat, un ingrédient…                ]
À découvrir · cartes à faire défiler
Choisir un univers · six choix + voir tout
Toutes les recettes · cartes avec photo ou illustration
Univers choisi : retour + recherche + grille de plats
Navigation Semaine / Recettes / Courses / Compte
```

## Direction visuelle proposée

Identité par défaut « **Potager** » : fond clair `#F7F8F3`, surface `#FFFFFF`, texte `#1C2A22`, texte secondaire `#56645A`, accent `#1B6B4A`, séparateur `#DCE5DC`. Le texte principal sur fond clair atteint environ **14,0:1** ; le texte secondaire **5,9:1** ; le blanc sur l'accent **6,5:1**.

Mode sombre neutre : fond `#111113`, surface `#1D1D20`, texte `#F4F4F5`, secondaire `#BCBCC2`, séparateur `#3B3B40`. Seul l'accent choisi apporte de la couleur ; les surfaces, champs et fonds de cartes restent gris-noir. La lisibilité des photos et superpositions doit être contrôlée sur les écrans réels.

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

### Proposition restaurants — 14 octobre 2026

**Suite :** l'utilisateur a validé la maquette ; l'intégration de la vraie carte est réalisée sur development. Le plan fictif ci-dessous reste un prototype historique, pas la carte utilisée par l'application. Ville et localisation regroupées, recherche locale, repères tactiles/clavier, fiche et liste facultative ; Leaflet local et tuiles OSM volontaires. Contrôles locaux avec services simulés, essais sur téléphone/Ubuntu à faire ; voir les décisions pour limites, réseau et validation.

[Maquette interactive indépendante](prototypes/restaurant-picker.html), proposée après le retour utilisateur sur la liste trop lourde. Statut : **à valider visuellement ; non intégrée à l'application**. Le choix se fait sur une carte, avec recherche par nom/cuisine visible et petite fiche nom/adresse/distance → Choisir. Ville ou localisation, liste facultative repliée pour l'alternative clavier et saisie libre conservées. Pas de nouvel onglet ni de réservation.

Le prototype contient un plan schématique et quatre restaurants fictifs. Repères, recherche sans accents, zoom/déplacement, confirmation, annulation et nom libre fonctionnent localement ; la géolocalisation et le changement de ville sont explicitement simulés. Aucun appel réseau, accès au foyer ou écriture du planning. Les données géographiques réelles et leur couverture ne sont pas validées par ce prototype. Palette et icônes locales réutilisées ; Apple Design : `modality.md › Best practices` pour une tâche courte et une sortie claire, `searching.md › Best practices` pour recherche visible et portée locale explicite. Principes web, pas une interface iOS native.

Contrôle Chromium : 320/390/768/1024/1440 px clair/sombre, texte à 200 %, repères au clavier, résultats vides et parcours de choix/saisie/annulation ; aucune erreur JS ni requête réseau, captures inspectées. Ce test n'est pas un essai Safari/iPhone ou Ubuntu. L'intégration reste après validation du rendu, suivant les garde-fous ci-dessous.

- La refonte est **visuelle et ergonomique d'abord** : conserver recettes, planning, courses, comptes et données SQLite. Pas de migration de données pour changer une couleur ou un composant.
- Maquette de Semaine, Recettes, fiche et Courses avant développement ; faire valider le rendu sur téléphone, puis intégrer par écran sans remplacer tout d'un coup.
- Vérifier Safari iPhone et Android, 320–430 px, texte agrandi, contraste, focus clavier et modes clair/sombre. Les commandes ne doivent pas se chevaucher ni masquer le contenu sous la navigation.
- Éviter la copie des illustrations, formulations, icônes, photos et écrans Jow. Son parcours recette → menu → courses est une inspiration ; Manger! doit rester reconnaissable et librement auto-hébergeable.
- Les photos culinaires doivent provenir des utilisateurs ou d'une source réutilisable avec droits vérifiés ; aucune photo Jow ni lien direct vers ses médias. Sans photo, montrer un substitut cohérent plutôt qu'une image trompeuse.
- Ne pas ajouter un tutoriel obligatoire, un onglet « Plus », des animations gratuites ou des options de thème dans chaque écran. Une transition courte à l'ouverture de la fiche suffit si elle aide à suivre le contexte ; respecter la réduction des animations.

La maquette mobile a été validée avant l'intégration. Les équipements et données nutritionnelles demanderaient un chantier fonctionnel séparé avant d'apparaître dans la fiche.

## Nouvelle proposition — 7 octobre 2026

La demande de reprendre Romi/Jow autorise maintenant une proposition pour les profils alimentaires. Une nouvelle maquette locale séparée présente l'exploration (recherche, univers et recettes de saison), les quatre onglets et un profil en trois étapes par personne : prénom/régime, goûts facultatifs avec cru/cuit, récapitulatif. Les profils restent distincts des comptes de connexion. Les goûts orientent les propositions sans exclure les recettes aux données incertaines et ne constituent pas une protection contre les allergies.

Palette existante conservée, avec fond gris/noir en sombre. Pas de questionnaire de calories, budget ou enseigne, ni nouveau menu principal. La maquette ne modifie aucune donnée réelle. L'utilisateur a validé la proposition le 7 octobre : le nouveau parcours de profils est intégré depuis Compte → Personnes du foyer, avec les données et API actuelles. Les cartes de régime sont des choix radio natifs, les goûts peuvent être ajoutés et retirés, et la confirmation ne s'enregistre qu'à la dernière étape. Le filtre saisonnier reste intégré aux recettes. Aucune illustration de démonstration n'est substituée aux photos réelles ; les autres fonctions du planning et des courses sont conservées.
