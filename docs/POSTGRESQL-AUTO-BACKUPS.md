# Sauvegardes PostgreSQL automatiques

2 novembre 2026 — activation confirmée par l’administrateur sur son instance PostgreSQL principale. Première échéance quotidienne encore à observer. Pas de nouvel écran, d’inscription à un service ou de sauvegarde envoyée à l’extérieur.

## Comportement

- Chaque jour à **03 h Europe/Paris**, un minuteur systemd utilisateur lance une copie logique cohérente avec l’outil administratif existant. Les 22 tables, comptes, photos et métadonnées de migration sont inclus. L’application continue de fonctionner : aucune commande stop/up/start.
- Contrôle de fin de dump, SHA256 contre le manifeste et lecture de l’inventaire par `pg_restore --list`, puis marqueur durable. Ce contrôle ne compare pas la base vivante après la copie, car elle peut avoir reçu de nouvelles écritures.
- Conservation des **7 dernières archives automatiques complètes**, dont la nouvelle, même si l’horloge a reculé. Plusieurs lancements manuels peuvent donc consommer plusieurs places le même jour ; ce n’est pas une garantie de sept jours.
- Toutes les archives complètes comptées dans la rotation sont recontrôlées avant toute suppression. Corruption, lien symbolique, fichier inattendu ou propriétaire logique différent : rotation refusée. Retrait de trois fichiers connus puis du dossier vide ; aucune suppression récursive.
- Verrou exclusif et nom de conteneur fixe empêchent les chevauchements. Un verrou après crash n’est jamais repris sur la seule base de son âge. Copies partielles, archives manuelles et anciennes sauvegardes de migration conservées hors rotation.

Dossier privé : `~/services/manger-postgres-validation-private/archives/automatic`. Métadonnées de propriété, verrou et archives restent privés ; le rapport affiche seulement un résultat et des nombres d’archives. Modes 0700/0600 sous Linux, pas de chiffrement annoncé.

## Activer sur le Linux existant

Depuis une session SSH du compte habituel, **sans sudo devant tout le bloc** :

```sh
(
  set -eu
  cd ~/services/manger
  git diff --quiet
  git diff --cached --quiet
  git pull --ff-only origin development
  bash scripts/install-postgres-backups.sh
)
```

L’installateur exige le clone `~/services/manger`, une session systemd utilisateur accessible et l’accès Docker déjà utilisé. Il refuse de remplacer des unités présentes, vérifie le calendrier et les deux unités avec le vrai `systemd-analyze`, puis **exige une première sauvegarde réussie avant installation/activation**. Ensuite il demande `sudo` uniquement pour `loginctl enable-linger` du compte courant : le gestionnaire utilisateur pourra fonctionner au démarrage et après déconnexion. Les deux fichiers sans secret sont installés sous `~/.config/systemd/user/`. Une seconde sauvegarde est exigée en lançant le vrai service utilisateur : cela vérifie aussi son environnement et son accès Docker. Seulement après réussite, le minuteur est activé et son état actif contrôlé. Ces deux copies initiales entrent dans les sept copies conservées.

Le lanceur fixe le projet `manger-postgres-validation`, son fichier privé et ses chemins secrets/archives/TLS ; il exige le marqueur de promotion PostgreSQL et neutralise les variables ambiantes correspondantes. Une nouvelle tâche de maintenance utilise l’image d’outils déjà validée, sans build/pull, dépendance démarrée ou port publié. Le seul fichier `postgres-auto-backup.js` du dépôt courant est monté en lecture seule dans cette tâche ; les API de sauvegarde/configuration restent celles de l’image compatible avec cette base. Une image incompatible échoue sans rotation ; une future évolution de schéma doit aussi préparer son image d’outils compatible.

`Persistent=true` tente de rattraper une échéance manquée lors du retour du gestionnaire utilisateur. Si Docker/PostgreSQL ne sont pas prêts, le service peut échouer ; aucun succès ou alerte externe automatique n’est promis. Le prochain lancement normal reste quotidien. Ne pas considérer la seule présence des fichiers d’unité comme une preuve d’activation.

## Contrôle et entretien

Pour un résumé sans journaux ni accès aux archives, depuis le compte Linux habituel, sans sudo :

```sh
bash ~/services/manger/scripts/status-postgres-backups.sh
```

La commande lit uniquement des propriétés ciblées des deux unités systemd utilisateur. Elle indique le résultat et la fin de la dernière exécution connue, l’état du minuteur, sa prochaine échéance et son dernier déclenchement observé. Une tâche oneshot réussie est normalement inactive : cet état seul n’est pas une erreur. Le succès exige aussi un code de sortie normal, un résultat réussi et une date de fin ; les valeurs initiales par défaut ne sont pas une preuve d’exécution. Une tâche en cours ou un état inaccessible/inconnu ne sont pas présentés comme une réussite.

Codes de sortie : `0` pour dernière exécution confirmée réussie et minuteur actif avec prochaine échéance connue ; `1` si une attention est nécessaire (échec, aucune réussite confirmée, minuteur arrêté/échéance absente) ; `2` si le relevé est indisponible ou la tâche encore en cours. Les dates sont celles du gestionnaire, pas une promesse de fraîcheur : lire la fin du service et le dernier déclenchement ensemble. Le relevé ne corrèle pas formellement chaque déclenchement à une copie, ne lit ni ne compte les archives et ne prouve ni leur disponibilité actuelle, leur intégrité ou leur restauration. Ce n’est pas une surveillance avec alerte ou seuil d’ancienneté. Les journaux restent la suite du diagnostic ci-dessous.

La commande ne lance pas de sauvegarde, ne recharge pas les unités, n’active aucun minuteur et ne contacte pas Docker/PostgreSQL. Elle ne lit pas le fichier env ni les secrets et ne publie pas le diagnostic brut de systemctl en cas d’erreur. Propriétés et distinction état/résultat fondées sur [systemctl show](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html) et [les propriétés Service/Timer systemd](https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.systemd1.html), vérifiées le 2 novembre 2026. Douze scénarios avec faux systemd réussis, dont une tâche terminée inactive et un échec d’accès ; première utilisation Linux du relevé encore à rapporter, sans remettre en cause l’activation déjà confirmée.

```sh
systemctl --user list-timers --all manger-postgres-backup.timer
systemctl --user status manger-postgres-backup.service --no-pager
journalctl --user -u manger-postgres-backup.service -n 30 --no-pager
```

L’état du dernier service et le journal montrent les succès/échecs ; un service oneshot réussi est normalement inactif ensuite. Ne pas partager des archives, fichiers env, secrets ou journaux privés bruts. Relancer volontairement une copie utilise `bash ~/services/manger/scripts/backup-postgres.sh` ; elle entre dans les sept copies conservées. Après un échec d’installation partielle, inspecter les unités et l’état plutôt que supprimer les archives ou relancer l’installateur qui refuse l’écrasement.

Pour suspendre les échéances : `systemctl --user disable --now manger-postgres-backup.timer`. Cette commande ne supprime ni copies ni fichiers privés, et ne retire pas le lingering utilisé éventuellement par d’autres services. Elle n’interrompt pas une sauvegarde déjà en cours.

## Reprendre un verrou après arrêt brutal

Seulement après diagnostic : suspendre le minuteur, vérifier que le service n’est plus actif et que **le conteneur de sauvegarde est arrêté/absent**. Garder et examiner le dossier incomplet ; ne jamais le compter comme copie complète. Le bloc suivant ne relance pas l’application et retire uniquement un conteneur de maintenance arrêté et étiqueté, puis le verrou régulier au chemin privé attendu :

<!-- shell:auto-backup-unlock -->
```sh
(
  set -eu
  systemctl --user stop manger-postgres-backup.timer
  state=$(systemctl --user show -p ActiveState --value manger-postgres-backup.service)
  case "$state" in inactive|failed) ;; *) echo 'Sauvegarde encore active : arrêt.' >&2; exit 1 ;; esac
  worker=$(docker ps --all --quiet --filter 'name=^/manger-postgres-auto-backup$')
  if test -n "$worker"; then
    test "$(docker inspect --format '{{.State.Running}}' "$worker")" = false
    test "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$worker")" = manger-postgres-validation
    test "$(docker inspect --format '{{index .Config.Labels "org.manger.operation"}}' "$worker")" = automatic-backup
    docker rm "$worker"
  fi
  private=$(cd -- "$HOME/services/manger-postgres-validation-private" && pwd -P)
  root="$private/archives/automatic"
  test "$(realpath -- "$root")" = "$root"
  test -f "$root/.owner.json" && test ! -L "$root/.owner.json"
  grep -q '"instance":"manger-postgres-validation"' "$root/.owner.json"
  test -f "$root/.lock" && test ! -L "$root/.lock"
  grep -Eq '^[a-f0-9]{32}$' "$root/.lock"
  rm -- "$root/.lock"
)
```

Une fois la cause traitée, lancer une sauvegarde manuelle et vérifier son succès avant `systemctl --user start manger-postgres-backup.timer`. Ne pas retirer un verrou pendant qu’un conteneur ou le service est actif ; aucune récupération automatique par PID/ancienneté. Le bloc refuse aussi une erreur de listing Docker avant retrait du verrou.

## Reprise et limites

Une archive complète `automatic/auto-…` contient `database.dump`, `manifest.json` et `automatic.json`. Les deux premiers se restaurent avec la [procédure administrative sur cible neuve et fermée](POSTGRESQL-ADMIN.md#7-restaurer-vers-un-secours-distinct) ; le marqueur automatique est ignoré par l’ancien outil de restauration. Choisir explicitement le dossier automatique : la référence des archives manuelles n’est pas réécrite.

Le contrôle d’inventaire lit la table des matières, pas une restauration entière de chaque copie. Le test local restaure effectivement une archive synthétique sur un second PostgreSQL, puis contrôle les 22 tables ; cela ne remplace pas une restauration périodique privée sur un secours. Rôles globaux, secrets, certificats et fichiers runtime de récupération restent à sauvegarder séparément selon le guide. Pas de conservation des WAL ni de reprise à chaque seconde.

Les copies restent sur le même serveur : elles ne protègent pas seules d’une perte de ce serveur/disque. Prévoir une copie indépendante et protégée. Les dossiers incomplets restent à examiner ; ils ne sont pas purgés automatiquement. L’espace dépend des données/photos et des autres archives conservées ; l’installation n’est pas une politique complète de reprise après sinistre.

Sources officielles vérifiées le 2 novembre 2026 : [snapshot cohérent de pg_dump 18](https://www.postgresql.org/docs/18/app-pgdump.html), [inventaire et restauration pg_restore 18](https://www.postgresql.org/docs/18/app-pgrestore.html), [tâches Compose sans dépendances et pull](https://docs.docker.com/reference/cli/docker/compose/run/), [minuteurs systemd persistants](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html), [gestionnaire utilisateur après déconnexion](https://www.freedesktop.org/software/systemd/man/latest/loginctl.html).

## Preuves disponibles

Préparation locale : 12 tests de rotation/protection sur fausses archives, 18 contrôles du lanceur/installateur/minuteur et de la reprise documentée du verrou avec faux Docker/systemd/sudo, puis 5 tests PostgreSQL natifs incluant écritures après snapshot, inventaire sans connexion, restauration sur secours, rotation réelle et corruption. Suite générale finale : 429/429 réussis, sans ignoré. Résultats finaux et relecture consignés dans les décisions.

**Retour Linux reçu le 2 novembre 2026, révision `3b75f43` :** première tâche Docker terminée avec une archive conservée, aucune retirée, intégrité et inventaire contrôlés. L’installateur a ensuite terminé après le lancement synchrone du service utilisateur, l’activation du minuteur et le contrôle de son état actif. Le journal de cette seconde copie n’est pas inclus dans le retour : son succès est établi par la séquence du script et son code de sortie, sans affirmer un nombre total d’archives non affiché. Prochaine échéance annoncée : **3 novembre 2026 à 03:00 CET** ; aucune échéance encore passée (`LAST` et `PASSED` vides). Le déclenchement quotidien, le fonctionnement après déconnexion/redémarrage, une purge réelle après sept copies et une restauration privée ne sont pas démontrés par cette installation. Aucun accès serveur ou transfert de données privées à l’agent.

Après la première échéance, contrôler `systemctl --user status manger-postgres-backup.service --no-pager` : le dernier résultat doit être réussi ; un service oneshot terminé peut être inactif. Consulter aussi le minuteur et le journal en cas de doute, sans relancer l’installateur.
