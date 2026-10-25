#!/usr/bin/env bash
set -euo pipefail
export HOME=/home/dunga
export PATH="$HOME/lowrider-backup-tools/deps/root/usr/bin:/usr/local/bin:/usr/bin:/bin"
export LD_LIBRARY_PATH="$HOME/lowrider-backup-tools/deps/root/usr/lib/aarch64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export GIT_SSH_COMMAND="ssh -i $HOME/.ssh/lowrider_backup -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$HOME/.ssh/lowrider_backup_known_hosts -o ConnectTimeout=20"
exec 9>"$HOME/lowrider-backup-tools/run.lock"
flock -n 9 || exit 0
exec >"$HOME/lowrider-backup-tools/last-run.log" 2>&1
trap 'result=$?; printf "Exit status: %s at %s\n" "$result" "$(date -Is)"; exit "$result"' EXIT
# Admission only: a later job can still start after this check.
if python3 "$HOME/lowrider-backup-tools/idle_guard.py"; then
    :
else
    guard_status=$?
    if [ "$guard_status" -eq 75 ]; then exit 0; fi
    exit "$guard_status"
fi
# Give motion/controller work priority; descendants inherit these settings.
renice -n 15 -p $$ >/dev/null 2>&1 || true
if command -v ionice >/dev/null 2>&1; then ionice -c 3 -p $$ || true; fi
echo "Backup started $(date -Is)"
python3 "$HOME/lowrider-backup-tools/prepare.py"
mkdir -p "$HOME/config_backup"
python3 - <<'PY'
import pathlib
home = pathlib.Path.home()
text = (home / 'lowrider-backup-docs/README.md').read_text()
text = text.replace('](screenshots/', '](lowrider-backup-docs/screenshots/').replace('src="screenshots/', 'src="lowrider-backup-docs/screenshots/')
text = text.replace('](RESTORE.md)', '](lowrider-backup-docs/RESTORE.md)')
(home / 'config_backup/README.md').write_text(text)
PY
bash "$HOME/klipper-backup/script.sh"
# Upstream's final cleanup can hide a failed push status. Check the remote explicitly.
local_head=$(git -C "$HOME/config_backup" rev-parse HEAD)
remote_head=$(git -C "$HOME/config_backup" ls-remote origin refs/heads/main | cut -f1)
test "$local_head" = "$remote_head"
date -Is > "$HOME/lowrider-backup-tools/last-success.txt"
echo "Verified GitHub backup $local_head"
