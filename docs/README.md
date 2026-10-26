# Documentation de Manger!

Documentation versionnée dans le dépôt, regroupée le **10 octobre 2026**. Elle rassemble le travail réalisé, les parcours disponibles, les raisons des choix et les limites connues. Elle ne contient ni données du foyer ni secrets du serveur.

## Utiliser et héberger

1. [Fonctionnalités réalisées](FONCTIONNALITES.md) : vue d'ensemble par usage, dont les régimes mixtes et l'anti-gaspi.
2. [Guide complet](GUIDE.md) : installation, utilisation, comptes, invitations, courses, import/export et sauvegarde/restauration.
3. [HTTPS local](HTTPS.md) : certificats, confiance iPhone/Android, configuration et renouvellement.
4. [Catalogue de 100 recettes](CATALOGUE.md) : import volontaire, univers, régimes, contenu et limites des 62 nouveaux plats ; [recettes de saison](RECETTES-DE-SAISON.md) pour les références et comparaisons mensuelles historiques.

Toutes les commandes du guide s'exécutent depuis la racine du dépôt, **pas depuis `docs/`**. Le dépôt sauvegarde le code et cette documentation, pas les bases du foyer.

[Construction et déploiement Docker](DOCKER.md) : correctif du 21 octobre, exclusions du contexte, contrôle de modules au build, tests d'image isolés, CI à activer, sauvegarde des deux bases et retour arrière. Compose et ses volumes restent inchangés ; construction réelle de cette révision non vérifiée localement faute de Docker.

## Comprendre et contribuer

**Migration en préparation :** [plan PostgreSQL validé le 22 octobre](MIGRATION-POSTGRESQL.md), [inventaire et contrats de référence](POSTGRESQL-CONTRATS.md), [tâches et points de contrôle](../tasks/todo.md). Node.js et l'interface conservés ; moteur actuel toujours SQLite, aucune base convertie, aucun nouveau service ou configuration déployés. Les instructions SQLite existantes restent valables.

[PostgreSQL de test local](POSTGRESQL-TEST.md) : outils portables Windows 18.6 vérifiés, pilote verrouillé et commande `npm run test:postgres` réellement passée sur des clusters temporaires. Sans service système ou donnée utilisateur ; ce n'est pas une migration ni une validation du déploiement Docker/Linux.

[Schéma PostgreSQL et migrations](POSTGRESQL-SCHEMA.md) : 22 tables sans amorçage, versionnement atomique, rôles séparés et tests de concurrence/droits ; module encore non branché à l'application. Lire les limites de confiance et les tâches de reprise/restauration avant tout futur déploiement.

[Frontière asynchrone PostgreSQL](POSTGRESQL-CONNEXION.md) : configuration explicite, client transactionnel, erreurs et arrêt borné ; socle testé séparément, sans portage métier ni bascule du serveur SQLite.

[Connexion et sessions PostgreSQL](POSTGRESQL-AUTH.md) : tâche 05 testée, middleware commun, verrous/révocations et compteurs partagés ; parcours d'accès complétés en 06 ci-dessous, sans activation PostgreSQL en production.

[Invitations et administration PostgreSQL](POSTGRESQL-ACCES.md) : tâche 06 testée, inscription membre unique, droits revalidés, réservation SMTP et service de récupération atomique ; commandes standard et serveur restent SQLite, sans bascule ni donnée réelle migrée. Les limites de branchement CLI sont précisées dans ce contrat.

[Personnes, goûts et protéines PostgreSQL](POSTGRESQL-FOYER.md) : règles et routes communes, lecture cohérente et écritures transactionnelles, retraits séparés des comptes ; SQLite normal conservé. Tests réels et limites de validation détaillés dans le contrat, aucun planning ou recette PostgreSQL activé.

[Création et édition des recettes PostgreSQL](POSTGRESQL-RECETTES.md) : tâche 08 testée, même contrat d'enregistrement et suppression protégée, enfants/photo atomiques et lecture cohérente ; exports SQLite synchrones préservés. Lancement normal PostgreSQL encore refusé, aucune donnée réelle convertie.

[Photos, favoris, avis et imports PostgreSQL](POSTGRESQL-ENRICHISSEMENTS.md) : tâche 09 testée, routes communes et catalogue atomique sans écrasement des titres présents ; aperçu sans écriture et export léger conservés. Résultats et limites du harnais et des transports simulés explicites.

[Repas, assiettes et calendrier PostgreSQL](POSTGRESQL-REPAS.md) : tâche 10 testée, ajout/remplacement/retrait atomiques, régimes et suppléments facultatifs, préconditions de créneau et ICS conservé ; limites des préconditions et des validations locales documentées. Aucun lancement normal PostgreSQL activé.

[Semaines, déplacements et restes PostgreSQL](POSTGRESQL-SEMAINES.md) : tâche 11 testée, lots atomiques, modèles figés, snapshots et conflits, liens locaux de restes et capacité protégés. 367 tests généraux et 176 PostgreSQL réels réussis, aucun ignoré ; nettoyage de test EBUSY fiabilisé de façon bornée. Prochaine tâche 12 : stock, suggestions et calculs ; SQLite reste le moteur normal.

[Notices des dépendances distribuées](../public/third-party-notices.txt) : versions, textes et copyrights de Nodemailer et du pilote PostgreSQL, sous licences MIT-0/MIT/ISC ; le code du projet reste AGPL-3.0-or-later.

1. [Architecture](ARCHITECTURE.md) : fichiers, données, flux, API principales et vérification.
2. [Décisions et blocages](DECISIONS.md) : raisons, compromis, erreurs connues et validations manquantes.
3. [Historique et priorités](ROADMAP.md) : lots livrés et travaux P1/P2/P3, avec la preuve disponible à chaque étape.
4. [Direction visuelle](DESIGN-REFONTE.md) : inspirations Romi/Jow, maquettes approuvées, intégration et garde-fous.
5. [Consignes de contribution](../AGENTS.md) : doc à chaque modification de code, fonctions lisibles, explication des décisions et blocages.

## Droit français/européen et confidentialité

Le [dossier de conformité](CONFORMITE.md), commencé le **19 octobre 2026**, distingue le logiciel distribué des instances gérées par chaque administrateur. Il documente la qualification AI Act, les sujets RGPD/traceurs, les droits des contenus et licences, la sécurité et les obligations conditionnelles ; travaux J1 à J5 non entièrement clos, aucune certification annoncée. La [notice technique de confidentialité](CONFIDENTIALITE.md) décrit les stockages, échanges externes et limites d'effacement actuels. Son résumé « Confidentialité et licences » est maintenant replié sur Connexion, Mon compte et dans Compte, avec liens projet/AGPL/CC0 ; pas de fenêtre imposée, case à accepter ou collecte supplémentaire. L'information propre à chaque exploitant reste à compléter lorsque nécessaire.

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

[Placard, suggestions et calculs PostgreSQL](POSTGRESQL-CALCULS.md) : étape 12, photographie cohérente, lots sérialisés, mêmes arrondis et DTO. SQLite reste actif ; tests locaux distincts d'un déploiement.

[Courses éditables PostgreSQL](POSTGRESQL-COURSES.md) : étape 13, édition conditionnelle, synchronisation additive, contrôles d’unité et lecture agrégée cohérente. Limites historiques des coches/rayons/retraits explicites.

[Analyse des sources SQLite](POSTGRESQL-SOURCES.md) : étape 14, commande administrative sans mutation de l’origine, sans PostgreSQL ni amorçage ; version/relations/octet/ordre contrôlés. 393 tests généraux réussis, aucun ignoré, HTTPS inclus ; sept tests source et CLI administratif sur copies synthétiques réussis, modules/image vérifiés. Aucune base réelle, publication, migration PostgreSQL ou validation Ubuntu/appareil.

[Transfert des 22 tables](POSTGRESQL-TRANSFERT.md) : étape 15, cible neuve seulement, comparaison exhaustive, état pending/ready, contrôle après COMMIT incertain. 397 tests généraux et 211 PostgreSQL réels réussis, aucun ignoré, HTTPS inclus ; contrôle image/modules réussi sans Docker. Trois cycles de relecture séparée réconciliés. Aucune donnée réelle, bascule, publication ou validation Ubuntu/appareil.

[Sauvegarde du foyer PostgreSQL](POSTGRESQL-SAUVEGARDE.md) : format JSON versionné, photographie cohérente et téléchargement protégé ; étape 16 testée, lancement normal toujours SQLite.
