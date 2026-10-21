# LowRider backup and restore

Repository: https://github.com/dung-adumbs/LowRider_Backup (private).

## What the backup contains

Repository root `lowrider-backup-snapshot/` mirrors selected paths relative to `/home/dunga/`, plus `settings/`, `versions.json` and `SHA256.json`. Config symlinks are copied as ordinary file contents so that `mainsail.cfg` is preserved. Existing `.bak`, `.bkp`, `.backup`, logs, G-code files and private credentials are excluded. Current active `.cfg` and `.conf` files are collected recursively. The stale overlay copy in the config directory is excluded; the actual Mainsail overlay is saved from its live path.

`settings/mainsail.json` exports Mainsail preferences except console history and transient G-code viewer cache. `settings/lowrider.json` preserves keep-out areas. Authorization namespaces and the raw live database are not copied. Browser-local preferences are not included: recheck Safe Z, the below-height cap, jog percentage/mode and other device-specific choices on each device.

## Recover deliberately while the machine is idle

1. Install a working Debian/Mainsail/Klipper/Moonraker system. Keep the router off and use software versions from `versions.json` as the compatibility reference. Flash/install firmware as needed for the board; this repository does not contain a complete operating-system image or firmware binary.
2. Clone/download this private repository using your GitHub account onto the restored machine. Use a separate folder, such as `/home/dunga/restore-lowrider`; do not clone over live configuration.
3. Verify every snapshot file before copying:

   ```python
   import hashlib, json, pathlib
   root = pathlib.Path('/home/dunga/restore-lowrider/lowrider-backup-snapshot')
   for name, expected in json.loads((root / 'SHA256.json').read_text()).items():
       assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, name
   print('Snapshot hashes verified')
   ```

4. Save the new system's configuration first. Stop Klipper/Moonraker while restoring their files, then copy the snapshot's `printer_data/config/` contents to `/home/dunga/printer_data/config/`. Restore `mainsail.cfg` either as the supplied file content or to its matching `mainsail-config` upstream version; copying onto an existing symlink changes its target. Check all includes and paths against the restored username, serial device, and hardware.
5. Copy `klipper/klippy/extras/cnc_force_jog.py` to `/home/dunga/klipper/klippy/extras/cnc_force_jog.py`. It must be present before enabling the `[cnc_force_jog]` config. Install the matching Mainsail release, then restore `mainsail/index.html` and `mainsail/lowrider-light-controls.js`. The index loads the overlay with a version query; clear the browser cache after restoration. Review the extension after Klipper updates and the overlay after Mainsail updates.
6. Restart Moonraker, then restore only the documented settings keys using its database API. Run this locally on the Pi with the clone path adjusted if necessary:

   ```python
   import json, pathlib, urllib.request
   root = pathlib.Path('/home/dunga/restore-lowrider/lowrider-backup-snapshot/settings')
   for namespace in ('mainsail', 'lowrider'):
       values = json.loads((root / (namespace + '.json')).read_text())
       for key, value in values.items():
           payload = json.dumps({'namespace': namespace, 'key': key, 'value': value}).encode()
           request = urllib.request.Request('http://127.0.0.1:7125/server/database/item',
               data=payload, headers={'Content-Type': 'application/json'}, method='POST')
           with urllib.request.urlopen(request, timeout=15) as response:
               result = json.load(response)
           if 'error' in result:
               raise RuntimeError(result['error'])
   ```

7. Restart Klipper. Verify Ready state, axis directions, endstops, configured limits, light control and timer settings. Initially keep Forced unhomed motion off. Home and set work/tool zeros again; saved coordinate values cannot substitute for physically re-establishing a reference. Inspect clearance and keep-out settings before jogging or running a job. UI screenshots document the expected layout, not an instruction to copy their position values.

## Re-enable backups after a rebuild

Install official Klipper-Backup into `/home/dunga/klipper-backup`. Copy the backed-up `lowrider-backup-tools/` scripts into `/home/dunga/lowrider-backup-tools/` and the docs folder to `/home/dunga/lowrider-backup-docs/`. Make `run.sh` executable. Copy `backup-config.example` to `/home/dunga/klipper-backup/.env` with mode 600. The supplied configuration uses SSH and contains no token.

Generate a new repository-only SSH key on the new Pi, add its public half as a write-enabled deploy key to this repository, and save the private half as `/home/dunga/.ssh/lowrider_backup` (mode 600). Do not upload it. Obtain GitHub's SSH host keys from the official HTTPS metadata endpoint `https://api.github.com/meta`, record `github.com <key>` entries in `/home/dunga/.ssh/lowrider_backup_known_hosts`, and verify them against GitHub's published fingerprints. This wrapper uses strict host-key checking.

Install `git`, `curl`, `rsync`, `jq`, `python3`, `flock`, and cron using the system package manager. On the original Pi, jq was installed without root by extracting Debian's jq/libjq1/libonig5 packages under `lowrider-backup-tools/deps/root/`; the wrapper includes that path. Those package binaries are intentionally excluded from Git. A system jq installation works as well.

Install the two schedule entries from `cron.example` into the `dunga` user's crontab, preserving unrelated entries. Run `/home/dunga/lowrider-backup-tools/run.sh` once and compare the GitHub commit with the local head before relying on the schedule. No Klipper/Moonraker restart is required for backup installation.

## Daily use and status

- Automatic check: every 15 minutes, plus an initial check two minutes after boot. Only changed files produce commits. Cron runs without an SSH login and survives reboots.
- Manual backup: `/home/dunga/lowrider-backup-tools/run.sh`.
- Most recent attempt: `/home/dunga/lowrider-backup-tools/last-run.log` (overwritten each attempt).
- Last verified remote success: `/home/dunga/lowrider-backup-tools/last-success.txt`.
- The wrapper rejects overlapping runs, stops if snapshot preparation fails, and verifies that the local commit equals GitHub after the official script finishes. Failed pushes retain local Git history and are retried on the next check. Offline operation has no new off-machine protection until upload succeeds.
- The preparation step rejects common credential patterns. Keep all future credentials in excluded secret files; this check is not a universal secret detector.
- Snapshot copying does not lock Klipper configuration files. Avoid editing them mid-backup; a subsequent check captures completed edits.
- To stop scheduling, remove only the marked LowRider entries from `crontab -e`. Remove the repository deploy key separately if permanently retiring the Pi.

## Editing this project

Edit the live controller configuration and overlay in their real locations; the snapshot is rebuilt each run. Edit README/screenshots/restore instructions in `/home/dunga/lowrider-backup-docs/`. A README in that folder is synchronized to the repository root by the wrapper. Keep machine wiring, limits and private settings in this private archive. Review and sanitize a separate export before publishing a reusable Mainsail project.
