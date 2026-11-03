# Intégration Faim de Lion

Développement sur `feat/fdl`, à la suite des quatre décisions validées le 3 novembre 2026. Publication sur `development` et préparation des commandes Linux autorisées ensuite par le porteur ; les commandes sur son serveur sont exécutées par lui.

Une liaison par instance est administrée depuis Compte et partagée par le foyer, recettes privées du compte FDL comprises. Activation PostgreSQL uniquement avec `MANGER_FDL_URL` ; sous SQLite ou sans configuration, les routes FDL répondent 404 et l'interface reste masquée.

La sauvegarde du foyer conservera le suivi des copies et leur provenance, jamais le jeton de liaison. Une restauration impose une nouvelle connexion. Un retrait par la modération neutralise une recette encore planifiée sans fabriquer d'ingrédient dans les courses ; les suppressions par l'auteur, états inconnus et pannes ne retirent rien.

## Utilisation

Dans **Compte**, un administrateur relie Faim de Lion. Le texte local annonce l'accès du foyer aux recettes privées ; le consentement FDL reste sur FDL. Aucun mot de passe FDL n'est saisi dans Manger!. Dans **Recettes → Recettes de Faim de Lion**, rechercher un plat, consulter **Mes recettes FDL** ou coller un lien/identifiant pour importer une copie locale. L'auteur, la licence, la version et le lien figurent dans la fiche. Les saisons et la provenance sont conservées séparément des univers locaux ; aucune photo distante n'est téléchargée.

Les mises à jour et avis sont regroupés dans des panneaux repliables. Une mise à jour demande confirmation avant de remplacer texte et ingrédients, signale les modifications locales, conserve la photo personnelle, les favoris et notes. **Ignorer** masque cette version jusqu'à une version supérieure. **Délier** conserve les copies et oublie le jeton local ; sa révocation côté FDL se fait dans la page Sécurité du compte FDL.

## Configuration

`MANGER_FDL_URL` est l'origine exacte de FDL, sans chemin, identifiants, barre finale, requête ou fragment, par exemple `https://fdl.example`. Une valeur invalide refuse le démarrage PostgreSQL. Le service Compose transmet la variable. Utiliser HTTPS pour protéger le jeton en transit ; HTTP reste possible pour le développement et les installations contrôlées. Aucun contournement de vérification des certificats.

Sans configuration, les routes FDL répondent 404 et les sections sont masquées. Sous SQLite, aucune table ou reprise de données n'est modifiée et les routes répondent 404, même sans session. Le `client_id` est l'origine visitée par l'administrateur avec le réglage HTTPS du serveur ; les en-têtes de proxy ne sont pas utilisés. Changer d'adresse d'accès demande une liaison correspondante.

Le jeton reste dans PostgreSQL, accessible au serveur et aux administrateurs autorisés. Il n'est pas envoyé au navigateur, aux journaux ou aux pages et n'est pas chiffré avec une clé cachée dans la même base. Base et sauvegardes complètes restent privées. Une liaison est obligatoire pendant la bêta ; l'état local « relié » ne prouve pas la validité distante sans appel FDL.

## Liaison et erreurs

`POST /api/fdl/relier` est réservé à un administrateur authentifié et protégé par le contrôle d'origine existant. Il renvoie seulement l'adresse du consentement, avec state et challenge S256 publics. Le verifier reste en mémoire dix minutes ; vingt demandes au maximum, invalidées par un redémarrage.

Le retour `GET /api/fdl/retour` est public seulement sur PostgreSQL configuré. La session générale garde `SameSite=Strict`. Un cookie de flux distinct, HttpOnly, limité au chemin du retour, `SameSite=Lax` et Secure en HTTPS, rattache la demande au navigateur initiateur. State absent, inconnu, expiré, dupliqué, déjà utilisé, mauvais navigateur ou administrateur révoqué : refus avant échange. Un state valable est consommé avant l'échange. Session et droits sont recontrôlés avant enregistrement. Liaison/déliaison sont sérialisées ; déliaison et restauration invalident les demandes en attente. Le retour n'affiche aucun code ou jeton, puis revient par une navigation locale.

Les appels serveur utilisent les chemins fixes du contrat, sur l'origine configurée : dix secondes maximum, redirections refusées, JSON borné à 2 Mio. Les messages distants ne sont pas recopiés dans les erreurs locales. Panne/réponse invalide/erreur serveur FDL : 502 ; liaison manquante ou révoquée : 409 ; recette inconnue : 404 ; retrait : 410 ; quota FDL : 429. Une recette encore invalide après conversion donne 400 sans écriture. L'unité vide est convertie en `pièce` avant validation.

## Suivi et concurrence

Vérification une minute après démarrage, puis vingt-quatre heures après chaque exécution et après liaison. Une seule vérification à la fois, arrêtée à la fermeture du serveur. Lots de cent identifiants : tous sont reçus avant application transactionnelle, pour qu'une panne tardive ne laisse pas des copies partiellement modifiées. Les erreurs de fond produisent un message de journal fixe, sans détail privé.

`published`/`private` et version supérieure proposent une mise à jour. Seul `removed` retire du contenu ; `not_found`, `hidden`, état inconnu ou manquant, panne et suppression par l'auteur conservent les copies. Les écritures recontrôlent jeton et origine sous le verrou du foyer. Un import simultané n'ajoute qu'une copie par origine/identifiant ; recette et suivi sont écrits dans la même transaction.

Une recette retirée inutilisée est supprimée. Référencée par un repas ou `meal_dishes`, elle garde son identifiant et devient une fiche neutre : titre générique, message de retrait, aucun ingrédient, photo, favori ou note. Les titres et références des repas sont conservés ; aucun faux ingrédient dans les courses. La fiche n'est plus proposée dans les sélecteurs et un avis informe le foyer jusqu'à acquittement. Une copie neutralisée n'est pas rétablie automatiquement par une publication ultérieure.

## Sauvegardes

Le format de foyer **`manger-household` v2** ajoute `fdl` : origines, identifiants, versions, états et métadonnées de source validés. Ses dix-huit tables métier historiques restent inchangées ; il n'inclut ni compte, session, jeton, liaison ou avis temporaire. Version 1 et anciennes sources SQLite restent acceptées.

La restauration conserve une copie préalable du foyer avec son suivi, efface explicitement liaison et avis, restaure les copies et recale les séquences dans la même transaction. Relier ensuite FDL à nouveau. Les copies d'une autre origine restent conservées sans être vérifiées auprès du nouveau serveur ; avec une sauvegarde ancienne sans suivi, les recettes deviennent ordinaires.

La sauvegarde administrative d'instance reste un `pg_dump` privé de toute la base, jeton compris. Inventaire et empreintes couvrent maintenant **25 tables**, contre 22 pour le transfert SQLite historique. Les anciennes archives de schéma 003 restent conservées : les restaurer avec les outils correspondant à leur schéma avant de migrer, jamais en affaiblissant le contrôle des nouveaux outils.

## Migration avant déploiement

Le schéma **004-fdl** est nécessaire à cette version, même sans activation de FDL. Remplacer seulement l'image web d'une base 003 fera refuser le démarrage. **Ne pas utiliser la procédure de mise à jour du catalogue pour ce changement de schéma.**

Pour l'instance Linux déjà promue, depuis le compte habituel, sans sudo :

```sh
cd ~/services/manger &&
git diff --quiet && git diff --cached --quiet &&
git pull --ff-only origin development &&
bash scripts/upgrade-postgres-fdl.sh
```

Le script exige le projet existant `manger-postgres-validation` et son dossier privé voisin `manger-postgres-validation-private`. Il n'installe pas une nouvelle instance. Un changement local suivi par Git bloque la procédure : l'examiner avant de recommencer, sans effacement automatique.

Le script met en pause le minuteur et attend la fin d'une sauvegarde en cours, construit et contrôle les images web/outils, puis arrête uniquement l'application pour sauvegarder/vérifier avec les outils correspondant au schéma actuel. Il applique 004, remplace les deux références d'image dans le fichier privé, sauvegarde/vérifie les 25 tables avant reprise des écritures, démarre uniquement l'application et contrôle sa santé. Il exige ensuite la réussite d'une sauvegarde automatique avant de réactiver un minuteur initialement actif. PostgreSQL, comptes, volumes, configuration restante et certificats sont conservés ; aucune promotion, import SQLite ou suppression de volume.

Sans option, `MANGER_FDL_URL` est conservée si elle existe ; sinon FDL reste masqué. Pour renseigner l'origine réelle de FDL, remplacer l'exemple et utiliser `bash scripts/upgrade-postgres-fdl.sh --fdl-url https://fdl.example` à la dernière ligne. L'origine est validée avant l'arrêt applicatif. Cela ne crée aucun compte FDL et ne relie pas automatiquement les comptes ; terminer la liaison dans Compte.

Chaque passage conserve les anciennes images, la configuration et les résultats sous `manger-postgres-validation-private/upgrade-fdl.*`, ainsi que les archives privées avant/après. Ne pas publier ces dossiers. En cas d'échec, le minuteur reste arrêté. Avant toute tentative de migration, le script peut redémarrer l'ancienne application s'il l'avait arrêtée ; après tentative, il ne remet jamais automatiquement une ancienne image sur un schéma potentiellement modifié. Corriger la cause puis relancer : 004 est répétable et un schéma déjà en 004 avec une ancienne configuration d'outils est pris en charge. Une sauvegarde n'est pas une restauration testée du serveur réel ; les anciennes archives 003 nécessitent leurs anciens outils.

Commande explicite sans import : `node postgres-schema.js --apply`, avec les variables administratives existantes. Depuis la fonction `pgc` habituelle, **après sélection de la nouvelle image d'outils et sauvegarde/arrêt des écritures** : `pgc --profile maintenance run --rm --no-deps --entrypoint node instance postgres-schema.js --apply`. Ce n'est pas un déploiement autonome. Migration transactionnelle et répétable, jamais automatique au démarrage.

Le contrôleur de sauvegarde automatique attend maintenant 25 tables : son script monté depuis le dépôt et l'image d'outils doivent être mis à jour ensemble. Ne pas lancer ce nouveau contrôleur contre les anciens outils 003. Le script ci-dessus réalise cette séquence ; la procédure ordinaire de mise à jour d'image ne la remplace pas.

## Vérification

Tests ciblés réussis : migration 003 conservant les données, répétition, import/rollback, versions, recette principale retirée, assiette séparée, sauvegarde sans jeton, restauration, permissions, state invalide/expiré/réutilisé/mauvais navigateur, administrateur révoqué, recherche/import et pannes. Faux FDL local, aucun compte réel.

Chrome isolé avec PostgreSQL et données synthétiques : consentement de test, retour PKCE, import puis mise à jour manuelle, aucune erreur JavaScript. Retour réellement intersite entre localhost et 127.0.0.1 : cookie de session Strict absent au callback, cookie de flux présent, session retrouvée après navigation locale. Quatre tailles de 320 à 1280 px, clair/sombre et texte à 200 %, contrôle des débordements et captures inspectées. La liaison doit se terminer dans le navigateur qui l'a initiée ; Safari et le mode application iPhone restent à valider.

Résultats finaux : **258/258 tests PostgreSQL**, puis **462/462 tests généraux**, aucun ignoré. Le scénario HTTP FDL renforcé par deux retours simultanés passe aussi 7/7 ; désactiver en mémoire la consommation du state fait échouer ce test (deux échanges au lieu d'un). Aucune modification du code source par ce contre-test. Les 27 scénarios des scripts de répétition/promotion réussissent avec l'inventaire à 25 tables. Images web et outils réellement construites ; contrôle des modules/commande de schéma/outils et démarrage/santé/icône/persistance SQLite après redémarrage réussis en conteneurs jetables sans réseau extérieur. La migration et les parcours FDL PostgreSQL sont testés nativement, sans prétendre à un déploiement Docker PostgreSQL/FDL complet.

La procédure Linux est couverte séparément par quinze scénarios avec Docker/systemd simulés, incluant la reprise après migration, une sauvegarde en cours et les échecs de sauvegarde/migration/démarrage. Aucun essai réel FDL déployé, iPhone/Safari, Android, CI distante ou Ubuntu déduit de ces tests. Les résultats et corrections intermédiaires sont détaillés dans [les décisions](DECISIONS.md).
