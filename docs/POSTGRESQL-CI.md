# Contrôles automatiques PostgreSQL — étape 20

26 octobre 2026 : workflow préparé et contrôlé localement ; **aucune exécution Forgejo attestée**. L’utilisateur confirme ne pas avoir configuré d’exécuteur (runner). Le test Docker Linux de l’étape 19 est réussi, mais il a été lancé manuellement et ne constitue pas une CI.

## Contrat du workflow

`.forgejo/workflows/docker.yaml` utilise JSON, sous-ensemble de YAML, comme le Compose candidat : Node contrôle sa structure sans nouvelle dépendance de parsing. Cette lecture locale ne prouve pas l’acceptation et l’ordonnancement réels par Forgejo.

1. Le job `tests` contient une matrice `sqlite` / `postgres`. La première entrée exécute toute la suite `npm test`, la seconde toute la suite native `npm run test:postgres`, avec reprises, restauration et refus de connexion inclus. Aucun repli entre moteurs ni test PostgreSQL ignoré si les binaires manquent.
2. Le job `docker` dépend de la réussite du job matriciel entier. Il vérifie les outils, installe le verrou npm sans scripts d’installation, audite les dépendances, contrôle les Compose existants et les exclusions du contexte avec des faux fichiers.
3. Une image propre au run est construite puis soumise au scénario SQLite et au scénario PostgreSQL de l’étape 19. Chaque bloc shell commence par `set -eu`, aucun `continue-on-error`, déploiement ou publication d’image.
4. Le checkout reste figé par SHA, sans conservation des identifiants. Seuls les push sur `development` / `main` et le lancement manuel sont déclarés ; pas de déclenchement automatique de code de forks.
5. Les données sont synthétiques et les nettoyages limités aux ressources de chaque scénario. Aucun téléversement de sauvegardes, secrets, journaux bruts ou dossier temporaire en artefact CI.

## Préparer l’exécuteur

Le runner doit être Linux, **dédié et jetable**, étiqueté `manger-docker`, avec Git, shell POSIX, Node 24+, npm, OpenSSL, Docker Engine/Compose et binaires PostgreSQL **18.6** (`initdb`, `pg_ctl`, `postgres`, `pg_dump`, `pg_restore`) préinstallés. Le compte qui exécute les tests natifs doit être non root ; le workflow le refuse explicitement sinon. La fixture valide également la version exacte avant création d’un cluster privé. Aucune installation système, service PostgreSQL partagé ou connexion à une base externe n’est effectuée par le workflow.

Définir dans les variables Actions du dépôt `MANGER_TEST_PG_BIN`, avec le chemin absolu réel des binaires de ce runner, par exemple `/usr/lib/postgresql/18/bin` **seulement si sa version 18.6 est vérifiée**. Ce n’est pas une URL de base ni un secret. Les mots de passe de fixtures sont générés pour chaque test, jamais ceux de l’instance Manger!.

L’accès Docker donne des pouvoirs sur l’hôte de son daemon. Ne pas brancher le runner sur le socket ou les volumes du serveur Manger! et ne pas lui transmettre de secrets de production. Une éventuelle machine virtuelle dédiée doit avoir son propre daemon Docker ; un simple conteneur montant le socket du serveur ne l’isole pas de ses données. Aucune installation d’un runner permanent sur le Linux personnel n’est autorisée implicitement par l’accord pour un scénario de test ponctuel.

## Activer puis prouver l’étape 20b

1. L’administrateur prépare l’hôte dédié et enregistre son runner dans Codeberg. Le jeton d’enregistrement reste privé et n’est transmis ni au dépôt ni à l’agent.
2. Activer Actions dans les unités du dépôt, vérifier le label `manger-docker` et la variable de binaires.
3. Lancer manuellement `Docker integrity` sur la révision publiée ; vérifier les deux entrées de matrice puis le job Docker dépendant, en conservant seulement URL de run, révision et résultat non sensible.
4. Confirmer qu’un échec de la connexion de test ou de la suite PostgreSQL bloque le job Docker ; ne pas confondre son échec attendu en test local avec une preuve d’ordonnancement Forgejo.
5. Après une première exécution réelle, configurer les statuts requis sur les branches protégées. Aucun nom de statut supposé, activation de protection ou blocage de fusion effectif n’est revendiqué avant ce contrôle.

Sources officielles consultées le 26 octobre 2026 : [Actions et enregistrement d’un runner Codeberg](https://docs.codeberg.org/ci/actions/), [runners et workflows Forgejo](https://forgejo.org/docs/latest/user/actions/overview/), [matrice, dépendances et variables](https://forgejo.org/docs/v15.0/user/actions/reference/). La fourniture d’un runner adapté reste une opération d’administration distincte ; le fichier de workflow seul ne lance pas les tests.

## Preuve et limites locales

Les contrats de CI sont écrits avant le workflow : échec initial sur l’ancien fichier, puis matrice/dépendances/checkout/erreurs bloquantes et absence de déploiement vérifiés. Les quatre tests ciblés CI/fixture passent. Les vrais blocs shell sont contrôlés en syntaxe, puis exécutés avec un faux npm : les deux moteurs propagent un échec 47 sans poursuivre, le moteur inconnu et les outils PostgreSQL non renseignés sont refusés. Un premier double de test avait mal converti le chemin Windows dans PATH ; correction du seul harnais ignoré, aucun contournement dans le workflow. Une relecture indépendante ne relève aucun défaut concret ; aucun modèle ou outil de relecture externe lancé.

Suite générale finale : **407 tests réussis, aucun échec ou ignoré, HTTPS inclus** ; 37 documents et 329 liens locaux vérifiés sans cible manquante. La suite PostgreSQL métier et les scripts Docker ne sont pas modifiés par ce lot. Une exécution native Windows ou un double shell ne démontre ni la matrice Forgejo, ni son accès Docker, ni une protection de branche effective. L’étape 20 reste ouverte jusqu’à cette activation et preuve, avant la répétition 21, le guide 22 et la bascule 23.

## Extension du 27 octobre — restauration complète requise

Le job Docker construit maintenant l’image applicative puis une image de maintenance dérivée avec `docker/postgres-tools.Dockerfile`. Il passe les deux tags à `test-postgres-image.sh`, imposant la sauvegarde/restauration complète sur secours séparé, en plus du parcours SQLite et des contrôles PostgreSQL historiques. Les outils ne sont pas ajoutés à l’image web, aucune image n’est publiée et aucun déploiement n’est déclenché. La nouvelle sonde native est incluse dans `test:postgres`, avec échec explicite si les outils manquent. [Contrat et limites](POSTGRESQL-REPETITION.md#restauration-docker-complète--préparation-du-27-octobre). Le runner reste à configurer et cette extension n’a pas été exécutée dans Forgejo.
