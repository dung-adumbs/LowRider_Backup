#!/usr/bin/env python3
"""Build a credential-free recovery snapshot for official Klipper-Backup."""
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import urllib.request

HOME = pathlib.Path.home()
DEST = HOME / 'lowrider-backup-snapshot'
SECRET = re.compile(r'(?im)^\s*(?:github_token|api_key|access_token|refresh_token|password|passwd|wifi_password|wpa_psk|client_secret)\s*[:=]\s*[^\s#]+|-----BEGIN (?:OPENSSH|RSA|EC|PRIVATE).*PRIVATE KEY-----|\b(?:ghp_|github_pat_)[A-Za-z0-9_]+')

def checked_copy(src, relative):
    data = src.read_bytes()
    if SECRET.search(data.decode('utf-8', errors='replace')):
        raise RuntimeError('Potential credential found; backup stopped: ' + str(relative))
    target = DEST / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)

def write_json(name, value):
    target = DEST / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')

def main():
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir(mode=0o700)
    config = HOME / 'printer_data/config'
    for src in sorted(config.rglob('*')):
        rel = src.relative_to(config)
        if any(part.startswith('.') for part in rel.parts):
            continue
        if src.suffix not in ('.cfg', '.conf') or 'secret' in src.name.lower():
            continue
        if not src.is_file():
            raise RuntimeError('Unreadable config or broken symlink: ' + str(src))
        checked_copy(src, pathlib.Path('printer_data/config') / rel)
    for name in ('index.html', 'lowrider-light-controls.js'):
        checked_copy(HOME / 'mainsail' / name, pathlib.Path('mainsail') / name)
    checked_copy(HOME / 'klipper/klippy/extras/cnc_force_jog.py', pathlib.Path('klipper/klippy/extras/cnc_force_jog.py'))
    for namespace in ('lowrider', 'mainsail'):
        with urllib.request.urlopen('http://127.0.0.1:7125/server/database/item?namespace=' + namespace, timeout=15) as response:
            value = json.load(response)['result']['value']
        if namespace == 'mainsail':
            value = {key: item for key, item in value.items() if key not in ('gcodehistory', 'gcodeViewer')}
        encoded = json.dumps(value)
        if SECRET.search(encoded):
            raise RuntimeError('Potential credential in settings; backup stopped')
        write_json('settings/' + namespace + '.json', value)
    versions = {'mainsail': (HOME / 'mainsail/.version').read_text().strip()}
    for name in ('klipper', 'moonraker', 'mainsail-config', 'klipper-backup'):
        versions[name] = subprocess.check_output(['git', '-C', str(HOME / name), 'rev-parse', 'HEAD'], text=True).strip()
    versions['os'] = pathlib.Path('/etc/os-release').read_text()
    write_json('versions.json', versions)
    hashes = {str(src.relative_to(DEST)): hashlib.sha256(src.read_bytes()).hexdigest() for src in sorted(DEST.rglob('*')) if src.is_file()}
    write_json('SHA256.json', hashes)
    print('Prepared', len(hashes), 'files; no machine commands issued.')

if __name__ == '__main__':
    main()
