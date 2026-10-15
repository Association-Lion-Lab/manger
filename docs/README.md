# Documentation de Manger!

Documentation versionnée dans le dépôt, regroupée le **10 octobre 2026**. Elle rassemble le travail réalisé, les parcours disponibles, les raisons des choix et les limites connues. Elle ne contient ni données du foyer ni secrets du serveur.

## Utiliser et héberger

1. [Fonctionnalités réalisées](FONCTIONNALITES.md) : vue d'ensemble par usage, dont les régimes mixtes et l'anti-gaspi.
2. [Guide complet](GUIDE.md) : installation, utilisation, comptes, invitations, courses, import/export et sauvegarde/restauration.
3. [HTTPS local](HTTPS.md) : certificats, confiance iPhone/Android, configuration et renouvellement.
4. [Catalogue de 100 recettes](CATALOGUE.md) : import volontaire, univers, régimes, contenu et limites des 62 nouveaux plats ; [recettes de saison](RECETTES-DE-SAISON.md) pour les références et comparaisons mensuelles historiques.

Toutes les commandes du guide s'exécutent depuis la racine du dépôt, **pas depuis `docs/`**. Le dépôt sauvegarde le code et cette documentation, pas les bases du foyer.

## Comprendre et contribuer

1. [Architecture](ARCHITECTURE.md) : fichiers, données, flux, API principales et vérification.
2. [Décisions et blocages](DECISIONS.md) : raisons, compromis, erreurs connues et validations manquantes.
3. [Historique et priorités](ROADMAP.md) : lots livrés et travaux P1/P2/P3, avec la preuve disponible à chaque étape.
4. [Direction visuelle](DESIGN-REFONTE.md) : inspirations Romi/Jow, maquettes approuvées, intégration et garde-fous.
5. [Consignes de contribution](../AGENTS.md) : doc à chaque modification de code, fonctions lisibles, explication des décisions et blocages.

## Lire les statuts correctement

**Implémenté** signifie que le comportement est présent dans le code. **Testé localement** signifie un essai automatique ou navigateur sur des données isolées. **Confirmé par l'utilisateur** désigne uniquement le cas qu'il a rapporté. **Différé** ne signifie ni livré ni planifié automatiquement.

Le dernier lot de code avant ce regroupement est `07b2a97` : suppression de recette protégée. La suite avait 158 tests réussis et un test HTTPS ignoré ; les parcours Chromium de la fiche et de la suppression avaient réussi. Les dernières corrections n'ont pas été validées sur le serveur Ubuntu ou Safari iPhone.

## Maintenir cette documentation

Lot **catalogue du 15 octobre 2026** : 100 recettes importables, 62 nouvelles fiches complètes pour les 15 univers existants et les quatre régimes. Ingrédients quantifiés et cru/cuit explicites, étapes et durées relues, aucun avis ou photo emprunté. Import volontaire et personnalisations conservées ; [répartition et mode d'emploi](CATALOGUE.md). Pas de nouvelle fonction ou surcharge d'écran.

Lot du **15 octobre 2026** : restaurants uniquement manuels, champ « Nom du restaurant », suppression complète de la recherche, des appels géographiques, de Leaflet et de la maquette. Données conservées sans migration. **204 tests réussis, aucun ignoré**, HTTPS inclus ; parcours Chromium isolés, cinq largeurs clair/sombre et texte à 200 %, aucune recherche ou requête externe dans le formulaire. Le nombre de tests baisse avec le retrait des seuls tests de la fonction abandonnée. Pas de validation nouvelle sur téléphone ou Ubuntu ; voir [la décision et les limites](DECISIONS.md#restaurants-manuels--15-octobre-2026). Les lots cartographiques ci-dessous sont historiques et ne décrivent plus le produit courant.

Lot **carte des restaurants du 14 octobre 2026** : maquette validée puis intégrée dans le dialogue existant, avec recherche locale, repères, fiche de choix, liste en repli et saisie libre. Leaflet local, tuiles OSM externes après recherche volontaire, aucune réservation. **215 tests réussis, aucun ignoré**, HTTPS inclus ; vraie bibliothèque vérifiée dans Chromium avec services simulés, cinq largeurs clair/sombre et texte à 200 %, protections de repas conservées. Pas de validation live des fournisseurs, sur téléphone ou Ubuntu.

Proposition historique du **14 octobre 2026** : maquette indépendante de choix sur carte, fictive et sans réseau, validée puis intégrée. [Maquette et recherche retirées le 15 octobre](DECISIONS.md#restaurants-manuels--15-octobre-2026) ; ancienne source récupérable dans Git, pas un fichier à ouvrir pour tester le produit actuel.

Dernière correction du **14 octobre 2026** : sélecteur Semaine → Ajouter → Choisir une recette et choix pour invités avec petite photo prioritaire, sinon même émoji que dans Recettes. Liste compacte et indication Favori conservées. **211 tests réussis, aucun ignoré**, HTTPS inclus ; Chromium isolé cinq largeurs clair/sombre, texte à 200 %, captures avant/après et ajout de repas revérifiés. Pas de nouvelle validation sur téléphone ou Ubuntu ; données réelles intactes.

Correction du **14 octobre 2026** après cette finition : univers et régimes en émojis, commandes en SVG ; photos prioritaires dans les recettes et le calendrier maison, dates/invités/restes inclus, sans perdre titres et portions. **208 tests réussis, aucun ignoré**, HTTPS inclus. Contrôle Chromium isolé avec image JPEG synthétique décodée, émojis et largeurs mobiles clair/sombre ; parcours général cinq largeurs et texte à 200 % revérifié, captures inspectées. Restes et assiettes séparées couverts en tests de markup. Aucun essai nouveau sur téléphone ou serveur Ubuntu ; photos et données réelles préservées.

Finition suivante du **14 octobre 2026** : icônes d'action, univers, compte et menus harmonisées en SVG local ; textes accessibles, favoris remplis et navigation conservés. **205 tests réussis, aucun ignoré**, HTTPS inclus. Chromium isolé des quatre onglets, cinq largeurs clair/sombre, texte à 200 % et favoris ; captures inspectées, contrôle des sauvegardes de repas conservé. 14 documents et 77 liens/ancres locaux vérifiés. Pas de nouveau test réel sur iPhone/Android/Ubuntu ; logo et images culinaires inchangés.

Dernier lot du **14 octobre 2026** : ajout d'un repas allégé, recettes derrière « Choisir une recette » et retour aux types sans changer de créneau. **201 tests réussis, aucun ignoré**, HTTPS inclus ; parcours Chromium isolé du menu et de ses variantes, recherche/favoris, clavier, cinq largeurs clair/sombre et texte à 200 %. Captures inspectées ; aucune nouvelle validation sur les téléphones ou le serveur Ubuntu. Choix et limites détaillés dans les décisions, utilisation dans le guide.

Dernier contrôle local du **11 octobre 2026** : aide certificat pour les appareils invités, 185 tests réussis (HTTPS réel inclus), téléchargement DER et parcours Chromium isolés. Les limites de Safari et de l’installation distante sont précisées dans [HTTPS.md](HTTPS.md) et [ROADMAP.md](ROADMAP.md).

Contrôle local final du **12 octobre 2026** : premiers calendriers régionaux et mois courant automatique de l'appareil, 190 tests réussis, aucun ignoré (HTTPS inclus). Parcours Chromium isolé des filtres et de la mémorisation, trois calendriers et douze mois simulés, retour visibilité/focus/onglet, transition décembre–janvier et deux fuseaux au même instant UTC, largeurs 320/390/760 px clair/sombre et texte agrandi. Aucun nouveau test sur téléphone ou serveur distant. La déconnexion au retour du partage Safari est retirée des problèmes actifs d'après le retour utilisateur du jour, sans attribuer une cause technique.

Contrôle suivant du **12 octobre 2026** : catalogue porté à 38 recettes avec [quatre adaptations saisonnières référencées](RECETTES-DE-SAISON.md), **194 tests réussis, aucun ignoré**, HTTPS inclus. Les quatre fiches et leurs sources ainsi que leur présence/absence sur trois calendriers × douze mois simulés sont vérifiées dans Chromium ; contrôles précédents de filtres, largeurs et fuseaux conservés. Import de quatre manquantes, personnalisations préservées et import répété sans doublon testés. 14 documents et 76 liens/ancres locaux contrôlés. Pas d'essai culinaire des adaptations ni de nouveau test réel sur iPhone/Android/Ubuntu.

Dernier ajustement du **12 octobre 2026** : filtre « De saison » plus sélectif, produits disponibles toute l'année insuffisants à eux seuls, compteur près du filtre et aide actualisée. **197 tests réussis, aucun ignoré**, HTTPS inclus, après relance ; échec ponctuel non reproduit du test des protéines consigné dans les décisions. Chromium vérifie trois calendriers × douze mois, compteur et filtres combinés, largeurs et texte agrandi. 14 documents et 76 liens/ancres locaux contrôlés. Aucun réimport requis pour ce changement, aucune donnée du foyer modifiée ; pas de nouvelle validation réelle sur iPhone/Android/Ubuntu.

Lors d'une modification, actualise le guide ou les fonctionnalités concernés ; pour un choix ou un blocage, actualise aussi `DECISIONS.md`. Ajoute le résultat réel et les limites de validation au suivi, sans transformer un ancien test en nouvelle preuve. Mets à jour cet index si une nouvelle page apparaît. Les petits fichiers laissés à la racine ne sont que des points d'entrée vers les documents de référence.
