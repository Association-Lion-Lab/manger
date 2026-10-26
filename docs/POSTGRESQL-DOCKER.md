# Vérification du candidat sur le Linux de test — 19b

Scénario **réussi sous Docker Linux le 26 octobre 2026**, exécuté par l’administrateur avec `b9a3ba4` et l’image `manger:pg-test-31ed51d`. Voir le résultat final ci-dessous ; les comptes rendus de préparation et du premier essai restent historiques. Aucun service ou volume existant ne doit être remplacé. L’accès SSH automatique n’a pas abouti ; ces commandes sont exécutées par l’administrateur.

19b1 : Compose autonome, TLS et bootstrap de rôles neufs. 19b2 : scénario sur image construite, recréation/persistance, coupure/reprise et refus de migration manquante. Le Compose utilise la syntaxe JSON, sous-ensemble de YAML, pour permettre une validation structurelle Node sans nouvelle dépendance ; l’acceptation réelle par Compose reste obligatoire sur Linux.

Le projet candidat, les volumes et les réseaux sont propres. Pas de port hôte, notamment pas de 5432 ; les sondes passent par docker exec. L’ancien compose.yaml et manger-data restent hors du scénario. Le volume PostgreSQL 18 monte /var/lib/postgresql, avec PGDATA /var/lib/postgresql/18/docker. L’image PostgreSQL 18.6-bookworm est figée par digest OCI multiarchitecture, consulté dans les métadonnées officielles le 26 octobre. Le tag Node de construction reste celui du Dockerfile existant, vérifié à chaque build.

TLS obligatoire entre Node et le service postgres. Le serveur copie la clé depuis le secret vers son seul volume, propriétaire postgres et mode 0600, avant l’entrée officielle ; le bootstrap temporaire écoute uniquement sur socket Unix. La santé sonde donc TCP 127.0.0.1 pour attendre la fin du bootstrap. Les rôles neufs app/migration sont non privilégiés, mot de passe jamais passé à psql en argument. Le service web ne monte que son secret applicatif et l’autorité publique ; le propriétaire reste dans le profil maintenance. Une initialisation en échec ne doit pas être contournée en réutilisant un cluster partiel : conserver le diagnostic puis choisir un nouveau projet de test.

Sources : [image officielle, PGDATA, secrets et initialisation](https://hub.docker.com/_/postgres/), [digest 18.6-bookworm](https://github.com/docker-library/repo-info/blob/master/repos/postgres/remote/18.6-bookworm.md), [isolation des projets Compose](https://docs.docker.com/compose/intro/compose-application-model/). Aucune réussite Docker/Linux, CI ou téléphone n’est acquise par la préparation de ces fichiers.

## Exécuter le scénario

Prérequis : Linux, Docker Engine et Compose fonctionnels pour le compte courant, OpenSSL disponible, réseau permettant de télécharger les images. Ne pas utiliser ce fichier Compose comme procédure de bascule : aucun port utilisateur n’est publié et les certificats de test expirent après un jour.

Après publication autorisée de la révision sur `development`, lancer depuis le Linux de test :

```sh
(
  set -eu
  cd ~/services/manger
  if [ -n "$(git status --porcelain)" ]; then
    echo 'Modifications locales présentes : arrêter et examiner git diff.' >&2
    exit 1
  fi
  git pull --ff-only origin development
  candidate_image="manger:pg-test-$(git rev-parse --short HEAD)"
  docker build --pull -t "$candidate_image" .
  sh scripts/test-postgres-image.sh "$candidate_image"
)
```

Une erreur interrompt le bloc avant l’action suivante. Le tag `manger:0.1.0`, le projet de l’installation SQLite et ses volumes ne sont ni remplacés ni arrêtés. Le Compose de test porte un nom aléatoire `manger-pg-test-…`, deux volumes et deux réseaux propres ; le script refuse une collision avant démarrage.

## Ce que le test doit prouver

1. Une source SQLite créée uniquement pour le test est importée dans PostgreSQL neuf, avec les rôles et secrets distincts. TLS accepte l’autorité prévue, refuse une autre autorité et un nom de service absent du certificat.
2. Le serveur candidat démarre sans base SQLite de repli, sans outils de test dans l’image et sans secret propriétaire monté dans le web. Connexion, recette/photo, favori, avis, placard et article manuel sont exercés par HTTP interne.
3. Les deux conteneurs sont arrêtés puis supprimés et recréés sans supprimer les volumes. Les 18 tables du foyer, les octets des photos, la session et la prochaine identité sont contrôlés. La sortie de l’application doit être propre sur Linux.
4. PostgreSQL est coupé puis relancé : la santé doit échouer pendant la panne et revenir sans recréer ni relancer l’application. Une copie jetable de l’image privée de la migration 003 doit échouer pour ce module précis.
5. Un bootstrap répété est refusé ; les sorties psql et journaux PostgreSQL capturés sont contrôlés pour les trois mots de passe synthétiques. Les valeurs restent masquées dans le résultat public.

## Nettoyage et diagnostic

Le nettoyage compare les étiquettes privées des conteneurs, réseaux et volumes au jeton de cette exécution avant `down --volumes` du seul projet de test. Il n’exécute aucun prune, aucune suppression de l’ancien volume et aucun nettoyage global. Si la propriété ne peut pas être établie, la suppression est refusée.

En réussite, le dossier temporaire et les ressources de ce seul projet sont supprimés ; l’image candidate demeure disponible. En échec, le dossier privé indiqué est conservé avec les diagnostics et secrets synthétiques ; les journaux Compose y sont capturés avant le retrait des conteneurs reconnus si Docker répond. Si la collecte échoue, les ressources sont conservées et signalées pour permettre le diagnostic. Ne pas publier ce dossier, les secrets ou les journaux bruts. Communiquer le dernier message d’erreur du script ; si le nettoyage a échoué, garder le nom de projet pour examiner ses ressources avant toute suppression manuelle.

Les scripts de bootstrap sont montés individuellement depuis le dépôt, jamais incorporés dans l’image applicative. Les programmes de sonde passent sur l’entrée standard ; `.dockerignore` exclut `docker/`, `scripts/`, les tests, les données et les secrets. Le contrôle de contexte Docker utilise seulement de faux fichiers pour vérifier ces exclusions ; il reste lui aussi à exécuter avec un moteur Docker.

L’étape 19 est close après le résultat Linux final ci-dessous. La CI de l’étape 20, la répétition 21, le guide vérifié 22 et la bascule volontaire 23 restent distinctes.

## Contrôles locaux disponibles

405 tests généraux réussis, aucun ignoré ou échec, HTTPS inclus. Syntaxe des trois scripts shell et des deux programmes JavaScript, contrat structurel du Compose et chargement des modules vérifiés. Les programmes source/sonde ont aussi exercé les requêtes et comparaisons contre PostgreSQL natif temporaire, avec redirection de leurs seuls chemins synthétiques. Ce contrôle n’a pas recréé de conteneurs et ne prouve pas les montages, droits Linux ou TLS interconteneurs ; ces assertions restent à exécuter dans le scénario complet. Trois cycles de relecture réconciliés ; pas de contrôle externe ou publication automatique.

## Premier essai Linux — 26 octobre 2026

Sortie transmise par l’administrateur pour `31ed51d` : construction réelle de l’image réussie sous Docker Linux, Compose 5.6.0, PostgreSQL démarré, contrôle des journaux et TLS positif/négatif passés. L’import affiche `ready` avec les 22 tables et leurs empreintes. Le scénario s’arrête ensuite sans annonce de démarrage applicatif ; ses seuls conteneur, réseau et volume PostgreSQL de test sont retirés. Ce rapport ne donne pas le code de sortie de la commande d’import et ne démontre pas la cause de l’arrêt. Ni persistance après recréation, ni reprise applicative, ni étape 19 complète ne sont validées.

Le script affiche désormais l’étape active et le code de sortie en cas d’échec, distingue HUP/INT/TERM et annonce le retour 0 de l’import avant de lancer le web. Aucun argument contenant un secret, trace `sh -x` ou journal privé brut n’est demandé. Le nettoyage et les contrôles existants restent en place ; aucune réussite n’est forcée et aucun code d’erreur n’est ignoré. Diagnostic testé avec faux Compose et code d’échec 47, sans accès Docker ; le retrait est toujours refusé si la propriété ou la collecte de journaux échoue. Syntaxe shell recontrôlée. La suite générale de 405 tests ci-dessus précède ce seul ajout de diagnostic.

L’image applicative `manger:pg-test-31ed51d` peut être réutilisée pour le prochain essai, car seuls ce script exclu de l’image et la documentation ont changé. Depuis la racine du dépôt Linux après récupération de la nouvelle révision :

```sh
sh scripts/test-postgres-image.sh manger:pg-test-31ed51d
```

## Résultat final Linux — étape 19 close

Deuxième sortie transmise par l’administrateur, scénario `b9a3ba4` sur l’image déjà construite `31ed51d` : commande de transfert terminée avec le code 0, web sain, écritures et sauvegarde réalisées ; les deux conteneurs ont réellement été retirés et recréés en conservant leurs volumes. Comparaison des 18 tables du foyer, octets des photos, session et prochaine identité réussie. Arrêt applicatif propre, coupure PostgreSQL avec santé en échec puis reprise du même processus applicatif ; retrait expérimental de la migration 003 correctement refusé. Message final « Candidat vérifié » présent et nettoyage des seuls deux volumes, deux réseaux et deux conteneurs de test terminé.

Le TLS positif/négatif, le bootstrap et le contrôle des journaux passent également dans ce deuxième scénario. L’absence de message « Arrêt du scénario » et la fin complète attestent la réussite de ce parcours synthétique. La cause du premier arrêt n’a pas été reproduite et reste inconnue ; l’ajout de diagnostic n’est pas présenté comme une correction causale.

Étapes 01–19 closes. Aucune donnée réelle transférée, aucune bascule de l’installation habituelle, aucune recette Safari/iPhone ou Android, aucun runner Codeberg ni CI activé par ce test. La prochaine étape 20 doit distinguer préparation du workflow et première exécution attestée.
