#!/usr/bin/env bash
set -euo pipefail
[[ $# == 0 && $(uname -s) == Linux && $(id -u) != 0 ]] || {
  echo 'Lancer sans argument depuis le compte utilisateur habituel, sans sudo.' >&2; exit 2;
}
declare -A service timer
read_unit() {
  local data key value
  local -n fields="$2"
  if ! data=$(LC_ALL=C systemctl --user show --all --property="$3" "$1" 2>/dev/null); then
    echo 'Contrôle indisponible : gestionnaire systemd utilisateur inaccessible.' >&2; exit 2;
  fi
  while IFS='=' read -r key value; do
    case "$key" in
      LoadState|ActiveState|Result|ExecMainCode|ExecMainStatus|ExecMainExitTimestamp|NextElapseUSecRealtime|LastTriggerUSec) fields["$key"]="$value" ;;
    esac
  done <<< "$data"
}
read_unit manger-postgres-backup.service service LoadState,ActiveState,Result,ExecMainCode,ExecMainStatus,ExecMainExitTimestamp
read_unit manger-postgres-backup.timer timer LoadState,ActiveState,NextElapseUSecRealtime,LastTriggerUSec
if [[ ${service[LoadState]:-} != loaded || ${timer[LoadState]:-} != loaded ]]; then
  echo 'Contrôle indisponible : unités de sauvegarde absentes ou non chargées.' >&2; exit 2;
fi
status=0
case ${service[ActiveState]:-} in
  active|activating|deactivating|reloading)
    echo 'Dernière exécution : en cours ou en transition, résultat non confirmé.'; status=2 ;;
  inactive|failed)
    if [[ ${service[ActiveState]} == inactive && ${service[Result]:-} == success &&
      ${service[ExecMainCode]:-} == 1 && ${service[ExecMainStatus]:-} == 0 &&
      -n ${service[ExecMainExitTimestamp]:-} && ${service[ExecMainExitTimestamp]} != n/a ]]; then
      printf 'Dernière exécution : réussie (fin : %s).\n' "${service[ExecMainExitTimestamp]}"
    elif [[ ${service[ActiveState]} == failed || ${service[Result]:-success} != success ]]; then
      echo 'Dernière exécution : échec. Consulter le journal du service.'; status=1
    elif [[ ${service[Result]:-} == success && ${service[ExecMainCode]:-} == 0 &&
      ${service[ExecMainStatus]:-} == 0 && ( -z ${service[ExecMainExitTimestamp]:-} || ${service[ExecMainExitTimestamp]} == n/a ) ]]; then
      # Initial values also return after systemd unloads a completed unit.
      echo 'Dernière exécution : historique indisponible dans l’état courant de systemd.'
      echo 'Consulter le journal : journalctl --user -u manger-postgres-backup.service -n 20 --no-pager'
      status=2
    else
      echo 'Dernière exécution : aucune réussite confirmée.'; status=1
    fi ;;
  *) echo 'Dernière exécution : état inconnu, résultat non confirmé.'; status=2 ;;
esac
if [[ ${timer[ActiveState]:-} == active && -n ${timer[NextElapseUSecRealtime]:-} && ${timer[NextElapseUSecRealtime]} != n/a ]]; then
  printf 'Minuteur : actif. Prochaine échéance : %s.\n' "${timer[NextElapseUSecRealtime]}"
else
  echo 'Minuteur : inactif ou prochaine échéance inconnue.'
  if [[ $status == 0 ]]; then status=1; fi
fi
if [[ -n ${timer[LastTriggerUSec]:-} && ${timer[LastTriggerUSec]} != n/a ]]; then
  printf 'Déclenchement du minuteur : %s.\n' "${timer[LastTriggerUSec]}"
else
  echo 'Déclenchement du minuteur : aucun observé dans ce gestionnaire utilisateur.'
fi
echo 'Relevé du service uniquement, sans vérification des archives ni preuve de restauration.'
exit "$status"
