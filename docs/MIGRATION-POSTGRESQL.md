# Plan de migration vers PostgreSQL

22 octobre 2026 — **plan validé par l'utilisateur ; préparation commencée, aucune migration implémentée ou lancée**.

Ce plan décrit le remplacement du stockage de Manger!, pas une refonte visuelle. Node.js 24+, les quatre onglets, l'API et le modèle « une instance = un foyer partagé » restent la base. Rust, FDL, le scan de recettes, le SaaS multi-foyers et un nouveau framework client sont hors périmètre.

## Résultat attendu

1. Une instance neuve et une instance migrée fonctionnent avec PostgreSQL, sans perdre de fonction métier.
2. Recettes, photos, personnes, repas, courses et comptes sont transférés avec leurs identifiants et relations ; les mots de passe existants restent utilisables.
3. Sauvegarde, restauration, administration et contrôle de santé fonctionnent réellement avec le nouveau stockage.
4. La bascule est volontaire, précédée d'une répétition et d'une sauvegarde vérifiée ; un simple pull ne convertit aucune base.
5. Aucun changement graphique ni nouveau réglage technique dans les écrans clients, hormis les libellés de sauvegarde nécessaires.

L'utilisateur a validé le plan et le démarrage de sa préparation. Publication Codeberg et intervention de l'administrateur sur Ubuntu restent des étapes distinctes ; aucune conversion automatique des données n'est autorisée par une mise à jour du code.

## État de départ vérifié

Lecture du checkout `development`, code `5679528`. Le 22 octobre, ouverture en mémoire des schémas : **18 tables de foyer et 4 tables d'accès**, schéma foyer version 4. Contrôle `node image-check.js` réussi. Aucune base réelle ouverte pour cette étude.

| Zone | Source actuelle | Conséquence pour la migration |
| --- | --- | --- |
| Foyer et métier | [server.js](../server.js) : `DatabaseSync`, requêtes et transactions synchrones, migrations `PRAGMA`, amorçage | Adapter les appels à l'asynchrone sans modifier les calculs ni semer le catalogue sur une cible en cours d'import. |
| Accès | [accounts.js](../accounts.js) : comptes, sessions, invitations, limitation des tentatives, commandes administrateur | Préserver les hachages scrypt, les droits et les courses de concurrence déjà traitées. |
| Sauvegarde du foyer | [backup-tools.js](../backup-tools.js), [restore.js](../restore.js), routes et interface | Le fichier SQLite et `ATTACH DATABASE` ne sont pas des sauvegardes PostgreSQL ; définir leur remplacement avant livraison. |
| Livraison | [Dockerfile](../Dockerfile), [Compose](../compose.yaml), [test d'image](../scripts/test-docker.sh), [CI](../.forgejo/workflows/docker.yaml) | Conserver les exclusions et l'ancien volume ; ajouter une vraie preuve d'intégration PostgreSQL et de persistance. |
| Contrats | Tests `*.test.js`, interface et copies hors connexion | Beaucoup de tests injectent une base en mémoire et appellent directement des fonctions synchrones ; faire évoluer les fixtures sans retirer leurs assertions. |

Les 220 tests du lot précédent constituent un **repère historique**, pas un passage PostgreSQL. Docker, `psql` et `pg_dump` n'étaient pas disponibles dans le PATH local observé lors du cadrage. Le prérequis est maintenant levé pour les tests Windows : [PostgreSQL portable 18.6, SHA-256 figé, pilote de développement et fixture privée](POSTGRESQL-TEST.md), sans installation système ni usage du serveur personnel. Les versions et digest Docker restent à figer lors des tâches de livraison ; les tests Windows ne les valident pas.

Inventaire détaillé, contrats de sauvegarde/sessions et écarts de représentation : [contrats de référence](POSTGRESQL-CONTRATS.md). La clé opaque du placard contient un NUL à stocker en `bytea` côté PostgreSQL ; l'ordre historique `rowid` des corrections de rayon devra aussi être conservé explicitement.

## Architecture proposée

```text
Interface actuelle — HTML / CSS / JavaScript
             |
       API Node.js actuelle
             |
 Accès aux données asynchrones, transactions explicites
             |
 PostgreSQL : une base dédiée à cette instance
        |-- household : données du foyer
        `-- auth      : comptes et accès
```

**Choix proposé :** PostgreSQL 18 stable, image officielle avec variante et digest figés lors de l'implémentation, pilote `pg` verrouillé dans npm ; pas d'ORM ni de traduction automatique de SQL par expressions régulières. Une seule base, deux schémas fixes et qualifiés permettent de distinguer les sauvegardes du foyer et des accès tout en facilitant un import atomique. Un seul processus applicatif reste prévu : PostgreSQL n'autorise pas implicitement une exploitation multi-réplicas.

Une petite frontière d'accès aux données sera extraite au fil des parcours, en conservant les validations et fonctions de calcul indépendantes du stockage. Ne pas prétendre rendre `DatabaseSync` asynchrone par un simple changement de pilote. Les requêtes PostgreSQL utilisent des paramètres `$1`, `$2`, et toutes les étapes d'une transaction utilisent **le même client réservé**, libéré dans un `finally`. Sources : [requêtes paramétrées](https://node-postgres.com/features/queries), [transactions](https://node-postgres.com/features/transactions).

Le mode SQLite existant reste opérationnel pendant la préparation. Une configuration explicite choisira le stockage pour **l'ensemble de l'instance**, accès compris ; pas de foyer partagé entre deux moteurs, de double écriture ou de repli silencieux vers une base SQLite vide en cas de panne PostgreSQL. Les candidats incomplets restent réservés au développement, jamais déployés par le Compose courant. Après validation, la durée du support SQLite sera décidée séparément, sans suppression automatique des anciennes données.

### Contrats à préserver

| Particularité | Traitement prévu et preuve exigée |
| --- | --- |
| Identifiants et résultats SQL | Préserver les IDs, utiliser `RETURNING`, traduire `rowCount` et les alias camelCase explicitement ; contrôler les entiers sûrs côté JavaScript et les compteurs renvoyés en texte. Ne pas convertir les IDs en UUID. |
| Quantités, dates et expirations | Conserver la précision des quantités (`double precision` plutôt qu'un flottant 32 bits), les clés de jour `YYYY-MM-DD`, les instants/expirations et l'absence de décalage de fuseau. Choisir et tester les conversions aux frontières, notamment les entiers 64 bits. |
| JSON, drapeaux et photos | Préserver la représentation externe ; ne pas ajouter une refonte JSONB en même temps. `bytea` pour les octets des photos, empreintes avant/après ; conversion explicite des drapeaux vers les booléens de l'API. [Types du pilote](https://node-postgres.com/features/types). |
| Comparaisons | Tester accents, casse, tris, `NULL`, égalité des noms et clés uniques, `LIKE`/`COLLATE NOCASE` ; une collation ou un tri différents ne doivent pas changer les suggestions, snapshots ou conflits silencieusement. |
| Transactions et erreurs | Remplacer les syntaxes SQLite et `PRAGMA`, garder cascades/restrictions et atomicité ; traduire les erreurs utiles via [SQLSTATE](https://www.postgresql.org/docs/18/errcodes-appendix.html), sans exposer les requêtes, secrets ou détails du serveur. |

Les pauses `await` introduisent de nouveaux entrelacements. Vérifier en particulier : une seule acceptation d'invitation, révocation/changement de mot de passe pendant un hachage, compteurs de tentatives, création de menu concurrente et édition des courses. Les vérifications « lire puis écrire » doivent être atomiques là où la règle métier l'exige ; prévoir contraintes, écritures conditionnelles et verrous ciblés. La composition/copie ne doit pas écraser un créneau pris pendant la requête, tout en conservant le remplacement explicitement demandé d'un repas. [Verrous PostgreSQL](https://www.postgresql.org/docs/18/explicit-locking.html).

## Les cinq phases

### 1. Préparer le socle sans changer la production

Établir les contrats et fixtures, démarrer un PostgreSQL jetable, préparer les rôles et migrations versionnées. Vérifier les migrations sur cible vide et déjà initialisée, l'arrêt propre et les délais de connexion. Amorçage d'une instance neuve distinct d'un import : pas de recettes ou de compte administrateur recréés pendant la reprise.

**Passage requis :** PostgreSQL réellement testé, SQLite toujours fonctionnel, aucun accès aux bases privées. Le choix du pilote/version et du format de sauvegarde est validé avant les tâches correspondantes.

### 2. Porter les parcours par petites tranches vérifiables

Ordre : connexion et administration → foyer → recettes → planning → placard/suggestions → courses. Chaque tranche couvre lecture, écriture, refus, concurrence et reprise après erreur. Les calculs, régimes, saisonnalité, protéines, restes, unités et règles d'anti-gaspi ne sont pas redessinés. Les cas métier existants sont adaptés au moteur PostgreSQL ; SQLite sert temporairement de référence différentielle, pas de faux substitut au vrai serveur.

**Passage requis :** mêmes résultats, droits et conflits sur les fixtures communes ; aucune route « non portée » contournée ou renvoyée vers l'autre moteur. Les différences nécessaires de sauvegarde et de santé sont documentées, pas cachées dans les tests.

### 3. Construire la reprise et les sauvegardes

L'outil de reprise sera une commande administrative séparée, jamais exécutée automatiquement au démarrage. Il lit une **copie cohérente et arrêtée des deux bases** en lecture seule. Contrôles préalables : version, intégrité, tables/colonnes autorisées, relations, tailles, types et données hors schéma ; un cas inconnu bloque avec un diagnostic sans données personnelles. Une ancienne version sera normalisée sur une copie de travail séparée, jamais sur l'original ; ne pas passer le lecteur de migration par `createDatabase()`, qui amorce et modifie le schéma.

Un mode analyse produit les nombres de lignes et anomalies avant toute insertion. L'import refuse une cible non vide ou déjà marquée migrée, garde les identifiants, charge parents avant enfants et repas sources avant restes, puis recale les séquences. Tous les objets importés et le marqueur de migration sont validés **dans une seule transaction de la base cible** ; en cas d'échec, aucun import partiel n'est utilisable. L'initialisation de la cible est séparée et sans seed. Après un échec de séquence, reprendre sur une nouvelle cible vide, pas par fusion ou renumérotation silencieuse. [Séquences](https://www.postgresql.org/docs/18/functions-sequence.html).

Comparer toutes les tables par clés et valeurs normalisées, les relations et les empreintes des photos ; compter les lignes ne suffit pas. Inclure les 18 tables du foyer et les 4 d'accès, sans déduire une correspondance entre identifiant de connexion et personne à table. Copier les hachages de mots de passe à l'identique ; aucune réinitialisation imposée. Proposition : conserver sessions et invitations avec leur expiration absolue, sans prolongation ni réactivation, et conserver les limitations de tentatives encore valides. Vérifier des expirations et révoquer les secrets des fixtures après les tests ; ne jamais les afficher dans les rapports.

**Sauvegardes proposées, à spécifier avant codage :**

1. **Bouton du foyer :** format de données JSON versionné et identifié comme sauvegarde complète du foyer, photos incluses, comptes exclus comme aujourd'hui. Ce n'est pas l'export de recettes. Conserver un aperçu, la confirmation, une copie de récupération et une restauration atomique du foyer seulement. Anciennes sauvegardes SQLite acceptées après validation/normalisation sur copie, sans exécuter leur schéma ni un SQL fourni. Tester tailles et encodage base64 ; ne pas relever silencieusement la limite actuelle de 32 Mio ni supprimer ce parcours au profit d'une commande serveur.
2. **Exploitant :** sauvegarde PostgreSQL complète incluant `household` et `auth`, restauration répétée vers une base de secours, rôles/configuration traités séparément. Outils compatibles avec la version serveur ; ne pas copier à chaud les fichiers bruts du volume comme un fichier SQLite. [Sauvegardes PostgreSQL](https://www.postgresql.org/docs/18/backup-dump.html).

Ne pas accepter de dump SQL/`pg_restore` arbitraire depuis le navigateur : une restauration peut exécuter du code choisi par sa source. Les dumps administrateur restent des artefacts privés et de confiance ; les fichiers clients ne contiennent que les données autorisées. [Avertissement officiel](https://www.postgresql.org/docs/18/app-pgrestore.html#APP-PGRESTORE-DESCRIPTION).

### 4. Fiabiliser Docker et les preuves automatisées

Proposer un Compose PostgreSQL explicitement activé, sans modifier le mode courant à l'insu de l'administrateur. Nouveau volume dédié, **jamais réutiliser ni renommer `manger-data`**. Aucun port 5432 publié ; application et base communiquent sur le réseau Docker privé. Port web, URL, HTTPS, certificat et configuration SMTP restent inchangés. Rôles applicatif et migration distincts, application non-superutilisateur, secrets hors image/Git/journaux, pas de mode `trust` ni de désactivation TLS pour une base distante.

Avec l'image officielle 18, le montage persistant se fait à `/var/lib/postgresql` (et non en recopiant celui des images 17 et antérieures). Les mécanismes `_FILE` servent aux secrets pris en charge ; les scripts d'initialisation ne remplacent pas les migrations versionnées et ne tournent que sur un répertoire initialement vide. [Image officielle](https://github.com/docker-library/docs/blob/master/postgres/README.md#pgdata).

La construction de l'image de l'application vérifie les imports, modules imbriqués, ressources et migrations **sans se connecter à une base**. Le test d'intégration après construction ouvre un vrai PostgreSQL jetable. Réexaminer `.dockerignore` pour tous les nouveaux fichiers sans réautoriser globalement les SQL, scripts ou secrets ; conserver les tests de l'incident `catalog-extra.js`. Ne pas charger les outils PostgreSQL d'exploitation dans l'image applicative sans nécessité.

Adapter le test d'image : le mode actuel `--network none` ne peut pas joindre une base distincte. Prévoir un projet/réseau de test privé dédié, sans port hôte ni secret réel, et vérifier persistance **après recréation** de l'application et de PostgreSQL, pas seulement après redémarrage du processus. Santé applicative : vraie requête via le rôle applicatif et schéma attendu ; panne/timeout/refus d'accès = état non prêt, jamais `healthy` ni repli SQLite. `pg_isready` seul ne prouve pas les droits métier. Tester arrêt/reprise de PostgreSQL, récupération du pool et fermeture propre.

CI : matrice de transition SQLite/PostgreSQL, contrôles HTTP et HTTPS, scénario de migration, nouvelle sauvegarde/restauration et ancienne sauvegarde SQLite, puis image et persistance sur runner Linux dédié. Échec ou absence du service PostgreSQL requis = échec, pas test ignoré. Ne pas utiliser les volumes de production ; nettoyage limité aux ressources identifiées de cette exécution. Le runner Codeberg n'est pas activé par ce plan.

### 5. Répéter, puis laisser l'administrateur basculer

La première répétition est entièrement synthétique, avec écritures concurrentes et pannes injectées. Une répétition sur copie privée de données réelles sera ensuite réalisée par l'administrateur dans un environnement séparé ; aucune copie ne doit être fournie à l'agent ni au dépôt. Mesurer durée de reprise, contrôle des données, sauvegarde/restauration et retour arrière ; la durée de maintenance n'est pas estimable avant cette mesure.

Le guide final sera exécuté **par l'administrateur**, pas par l'agent sur Ubuntu :

1. Épingler l'ancienne image fonctionnelle et sa configuration ; vérifier un démarrage de secours et une sauvegarde complète protégée des deux bases. Prévenir les utilisateurs, terminer les opérations et arrêter l'application : cela bloque aussi connexion, invitations et synchronisations, pas seulement les saisies de recettes.
2. Faire la copie finale cohérente de tout `/data`, conserver l'ancien volume, analyser/importer vers la nouvelle cible PostgreSQL et vérifier le rapport. Ne pas réutiliser une copie de répétition devenue ancienne. Source figée jusqu'à la fin du choix.
3. Démarrer le candidat sur la nouvelle base, à la même origine HTTPS, sans accès des autres utilisateurs. Exécuter la recette administrateur, sauvegarde/restauration et contrôle des données ; éviter les écritures de test sur les données réelles ou identifier clairement toute écriture volontaire.
4. Si tous les critères passent, autoriser l'usage normal et relever l'heure de bascule. En cas d'écart avant toute nouvelle donnée utile, arrêter le candidat et remettre ancienne image/configuration avec l'ancien volume, sans supprimer PostgreSQL.
5. Après de nouvelles écritures utiles dans PostgreSQL, **l'ancien SQLite est périmé** : stopper les écritures, sauvegarder PostgreSQL et diagnostiquer/réparer. Ne pas redémarrer l'ancien SQLite comme si ces changements existaient dedans. Une reprise inverse nécessite un outil testé et une réconciliation explicite ; sinon revenir au point figé implique une perte annoncée et une décision de l'administrateur. Pas de promesse de retour arrière sans perte après réouverture.

Ni `down -v`, ni purge de volume, ni écrasement de sauvegarde, ni suppression automatique de SQLite. Garder une copie privée hors serveur et définir sa durée de conservation avec l'administrateur. L'ajout de PostgreSQL ne vaut pas conformité juridique ni changement de responsable des données ; actualiser les notices techniques si le stockage livré change.

## Critères de sortie et preuves

- **Données :** comparaison exhaustive des 22 tables, séquences utilisables, contraintes valides, photos identiques, calculs et copies locales compatibles ; essai réel de création après migration pour détecter une séquence mal recalée.
- **Sécurité :** mêmes comptes/mots de passe/droits/expirations ; invitation à usage unique sous concurrence, révocation et conflits testés ; aucune fuite de secret ou nouvelle exposition réseau.
- **Fonctions :** tests existants conservés et adaptés, API/erreurs utiles compatibles, recettes/assiettes/protéines/restes/courses/placard/menus/export/import identiques. Toute différence expliquée avant adoption, pas normalisée pour masquer un bug.
- **Exploitation :** vrai démarrage, panne/reprise, persistance après recréation, sauvegarde restaurée et répétition du retour avant réouverture réussis. Mise à jour d'une instance existante et installation neuve couvertes, pas uniquement le cas vide.
- **Preuve humaine :** guide relu, recette sur Safari iPhone faite par l'utilisateur et installation Ubuntu confirmée par l'administrateur. Les tests locaux/Chromium/CI ne prouvent pas ces étapes. Aucun autre OS mobile déclaré testé sans appareil.

Découpage détaillé, dépendances et validations : [plan d'implémentation](../tasks/plan.md) et [liste de tâches](../tasks/todo.md). La refonte visuelle reste un chantier distinct.

## Limites, décisions ouvertes et prochaine action

Le format exact du fichier de sauvegarde, le contrat asynchrone minimal, les versions/digests et le mode de distribution final de PostgreSQL doivent être figés pendant les tâches 01 à 04. Base par défaut proposée : une base PostgreSQL dédiée par instance, deux schémas, une interruption contrôlée et aucun double-write. Ne pas introduire une couche multi-foyers ou maintenir deux implémentations indéfiniment sans décision dédiée.

Pas de calendrier de livraison ferme : le précédent ordre de grandeur de plusieurs jours n'est pas un devis établi après portage. Réestimer après les tâches de socle et la première tranche de connexion ; mesurer la maintenance séparément. Tâches 01–03 réalisées : contrats, environnement local et [schéma versionné testé sans amorçage](POSTGRESQL-SCHEMA.md). La frontière asynchrone applicative reste à construire en 04 ; aucune route ne tourne encore sur PostgreSQL. Limites de confiance des rôles et autorité de recalage/restauration précisées dans le contrat du schéma et les tâches 15–17/19. L'avancement est suivi dans la liste de tâches ; aucun changement de stockage en production.
