#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# == 0 && $(uname -s) == Linux && $(id -u) != 0 ]] || { echo 'Lancer depuis le compte utilisateur habituel, sans sudo devant le script.' >&2; exit 1; }
repo=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
[[ -d $HOME/services/manger && $repo -ef $HOME/services/manger ]] || exit 1
units="$HOME/.config/systemd/user"
for suffix in service timer; do
  [[ ! -e $units/manger-postgres-backup.$suffix && ! -L $units/manger-postgres-backup.$suffix ]] || { echo 'Unités déjà présentes : vérifier la configuration existante, sans écrasement.' >&2; exit 1; }
done
systemctl --user show-environment >/dev/null
systemd-analyze calendar '*-*-* 03:00:00 Europe/Paris' >/dev/null
systemd-analyze --user verify "$repo/deploy/systemd/manger-postgres-backup.service" "$repo/deploy/systemd/manger-postgres-backup.timer"
stage='première sauvegarde'
finish() {
  result=$?
  if [[ $result != 0 ]]; then echo "Activation non confirmée : $stage (code $result). Archives conservées ; consulter la documentation." >&2; fi
}
trap finish EXIT
bash "$repo/scripts/backup-postgres.sh"
stage='activation du gestionnaire utilisateur au démarrage'
sudo loginctl enable-linger "$(id -un)"
stage='installation des deux unités utilisateur'
mkdir -p -- "$units"
for suffix in service timer; do install -m 0600 -- "$repo/deploy/systemd/manger-postgres-backup.$suffix" "$units/manger-postgres-backup.$suffix"; done
systemctl --user daemon-reload
stage='première exécution dans le gestionnaire utilisateur'
systemctl --user start manger-postgres-backup.service
stage='activation du minuteur'
systemctl --user enable --now manger-postgres-backup.timer
systemctl --user is-active --quiet manger-postgres-backup.timer
systemctl --user list-timers --all manger-postgres-backup.timer
echo 'Sauvegardes activées : chaque jour à 03 h Europe/Paris ; 7 archives automatiques réussies conservées.'
