# Documentation de Manger!

Documentation versionnée dans le dépôt, regroupée le **10 octobre 2026**. Elle rassemble le travail réalisé, les parcours disponibles, les raisons des choix et les limites connues. Elle ne contient ni données du foyer ni secrets du serveur.

## Utiliser et héberger

1. [Fonctionnalités réalisées](FONCTIONNALITES.md) : vue d'ensemble par usage, dont les régimes mixtes et l'anti-gaspi.
2. [Guide complet](GUIDE.md) : installation, utilisation, comptes, invitations, courses, import/export et sauvegarde/restauration.
3. [HTTPS local](HTTPS.md) : certificats, confiance iPhone/Android, configuration et renouvellement.
4. [Recettes de saison](RECETTES-DE-SAISON.md) : quatre ajouts, références et résultats attendus selon le mois.

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

Dernier contrôle local du **11 octobre 2026** : aide certificat pour les appareils invités, 185 tests réussis (HTTPS réel inclus), téléchargement DER et parcours Chromium isolés. Les limites de Safari et de l’installation distante sont précisées dans [HTTPS.md](HTTPS.md) et [ROADMAP.md](ROADMAP.md).

Contrôle local final du **12 octobre 2026** : premiers calendriers régionaux et mois courant automatique de l'appareil, 190 tests réussis, aucun ignoré (HTTPS inclus). Parcours Chromium isolé des filtres et de la mémorisation, trois calendriers et douze mois simulés, retour visibilité/focus/onglet, transition décembre–janvier et deux fuseaux au même instant UTC, largeurs 320/390/760 px clair/sombre et texte agrandi. Aucun nouveau test sur téléphone ou serveur distant. La déconnexion au retour du partage Safari est retirée des problèmes actifs d'après le retour utilisateur du jour, sans attribuer une cause technique.

Contrôle suivant du **12 octobre 2026** : catalogue porté à 38 recettes avec [quatre adaptations saisonnières référencées](RECETTES-DE-SAISON.md), **194 tests réussis, aucun ignoré**, HTTPS inclus. Les quatre fiches et leurs sources ainsi que leur présence/absence sur trois calendriers × douze mois simulés sont vérifiées dans Chromium ; contrôles précédents de filtres, largeurs et fuseaux conservés. Import de quatre manquantes, personnalisations préservées et import répété sans doublon testés. 14 documents et 76 liens/ancres locaux contrôlés. Pas d'essai culinaire des adaptations ni de nouveau test réel sur iPhone/Android/Ubuntu.

Lors d'une modification, actualise le guide ou les fonctionnalités concernés ; pour un choix ou un blocage, actualise aussi `DECISIONS.md`. Ajoute le résultat réel et les limites de validation au suivi, sans transformer un ancien test en nouvelle preuve. Mets à jour cet index si une nouvelle page apparaît. Les petits fichiers laissés à la racine ne sont que des points d'entrée vers les documents de référence.
