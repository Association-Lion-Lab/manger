# Mettre à jour saisons et catalogue — 2 novembre 2026

À exécuter par l'administrateur sur le Linux habituel. Ce lot réunit le calendrier français unique, les 20 soupes/mijotés et les 8 classiques : catalogue de 128 titres. Les fonctions et le schéma PostgreSQL ne changent pas ; l'image d'outils validée, les volumes, secrets, comptes et certificats sont conservés. Ce n'est pas une nouvelle promotion ou migration SQLite.

La construction et le test d'image utilisent des ressources synthétiques avant d'arrêter l'application. La sauvegarde utilise ensuite le contrôleur existant et l'image d'outils de l'instance retenue ; elle vérifie l'archive. Le remplacement ne vise que le service `app`, sans redémarrer PostgreSQL. Les données ne sont pas effacées. Les options de [Compose up](https://docs.docker.com/reference/cli/docker/compose/up/) `--no-deps`, `--no-build`, `--pull never` et `--wait` ont été vérifiées dans la documentation Docker. Le résultat réel Docker/Linux reste à confirmer par l'administrateur.

**Premier essai Linux reçu :** le pull jusqu'à `edb9531` réussit, puis le build refuse de lire `catalog-classics.js` sous `node` avec EACCES. Le sous-shell s'arrête avant la sauvegarde et avant `pgc stop app` : l'application précédente n'a pas été arrêtée par cette tentative. Cause : les nouveaux fichiers issus du pull avec `umask 077` gardent des droits 600 dans l'image. Le Dockerfile normalise désormais les droits dans `/app` avant `USER node`. Le contrôle de démarrage accepte aussi le dossier runtime `db`, auparavant oublié dans sa liste. Après publication de ces correctifs, relancer le bloc entier ci-dessous ; aucun `chmod` du dépôt, des secrets ou du dossier privé n'est nécessaire.

## 1. Mettre à jour l'application

Le sous-shell garde les variables locales à cette opération. Un arbre Git modifié, un échec de build/test ou une configuration inattendue arrête la suite avant l'interruption. Ne pas remplacer cette procédure par `docker compose up` sans les fichiers et le nom de projet explicites.

```bash
(
  set -eu
  umask 077
  cd ~/services/manger
  git diff --quiet
  git diff --cached --quiet
  git pull --ff-only origin development

  candidate_image="manger:catalogue-$(git rev-parse --short HEAD)"
  docker build -t "$candidate_image" .
  sh scripts/test-docker.sh "$candidate_image"

  private="$HOME/services/manger-postgres-validation-private"
  test -f "$private/instance.env"
  test ! -L "$private/instance.env"
  grep -Fxq postgres-lan "$private/promotion/state.txt"
  test "$(grep -c '^MANGER_CANDIDATE_IMAGE=' "$private/instance.env")" -eq 1
  while IFS='=' read -r setting ignored; do
    if [[ $setting =~ ^MANGER_[A-Z0-9_]+$ ]]; then unset "$setting"; fi
  done < "$private/instance.env"
  export MANGER_PG_SECRETS_DIR="$private/secrets"
  export MANGER_PG_SOURCE_DIR="$private/source"
  export MANGER_PG_ARCHIVE_DIR="$private/archives"
  export MANGER_WEB_TLS_DIR="$PWD/tls/server"
  pgc() {
    docker compose --project-name manger-postgres-validation \
      --env-file "$private/instance.env" \
      -f compose.postgres.yaml -f compose.postgres.instance.yaml "$@"
  }
  pgc config --quiet
  test -n "$(pgc ps -q app)"
  saved_env=$(mktemp "$private/instance.env.before-catalogue.XXXXXX")
  cp -p -- "$private/instance.env" "$saved_env"

  pgc stop app
  if ! bash scripts/backup-postgres.sh; then
    pgc start app
    exit 1
  fi
  sed -i "s|^MANGER_CANDIDATE_IMAGE=.*|MANGER_CANDIDATE_IMAGE=$candidate_image|" "$private/instance.env"
  pgc up -d --no-deps --no-build --pull never --wait --wait-timeout 90 app
  pgc exec -T app node healthcheck.js
  pgc ps
  bash scripts/status-postgres-backups.sh
)
```

Le fichier `instance.env.before-catalogue.…` conserve la configuration précédente dans le dossier privé. Ne pas le publier. Si la sauvegarde échoue, la commande redémarre l'ancienne application avant de s'arrêter. Après modification de l'image, un échec de santé demande un diagnostic ; aucun retour automatique de données ou de base n'est lancé. Les unités de sauvegarde déjà installées ne sont pas réinstallées.

## 2. Ajouter les recettes dans Manger!

Recharger Manger! à l'adresse habituelle **https://192.168.1.31:3000**, puis ouvrir **Recettes → Ajouter les recettes manquantes du catalogue**.

Depuis les 100 titres précédents : **28 ajouts** attendus ; depuis 120 : **8** ; si certains titres manquent ou sont déjà présents, le résultat dépend des titres exacts du foyer. Un deuxième import ajoute zéro titre déjà enregistré. La reconstruction seule n'effectue pas cet import volontaire et ne remplace pas les fiches personnalisées.

Pour retrouver les classiques, ouvrir l'univers **Plats mijotés**, avec **De saison désactivé** si besoin : ces plats ne sont pas tous couverts par le calendrier des légumes frais. Tester ensuite De saison pour vérifier le mois courant et l'absence de choix régional. Aucun changement d'horloge de téléphone requis.
