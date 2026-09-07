#!/usr/bin/env python3
"""Merge one app build into a shared Pages branch without deleting other builds."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import time


def safe_path(value):
    parts = value.split('/')
    if not value or any(not p or p in ('.', '..') or p.startswith('.') for p in parts):
        raise ValueError(f'Invalid publication path: {value!r}')
    if any(c in value for c in '\\?#%'):
        raise ValueError(f'Invalid publication path: {value!r}')
    return value


def destination(branch, default, classic):
    safe_path(branch)
    if branch != default and branch.split('/')[0] in ('classic', 'assets', 'live', 'img', 'style', 'explorations'):
        raise ValueError(f'Branch {branch!r} conflicts with a reserved site directory')
    return '/'.join(p for p in ('classic' if classic else '', '' if branch == default else branch) if p)


def merge(site, build, app, branch, default, classic, revision):
    if not (build / 'index.html').is_file():
        raise ValueError(f'Build has no index.html: {build}')
    prefix = destination(branch, default, classic)
    manifest_dir = site / '.pages-manifests'
    manifest_dir.mkdir(exist_ok=True)
    key = hashlib.sha256(f'{app}:{branch}'.encode()).hexdigest()[:24]
    manifest_path = manifest_dir / f'{key}.json'
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'files': []}
    owners = {}
    for path in manifest_dir.glob('*.json'):
        if path == manifest_path:
            continue
        data = json.loads(path.read_text())
        owners.update({name: f"{data['app']}:{data['branch']}" for name in data['files']})
    files = {}
    for source in build.rglob('*'):
        if source.is_symlink():
            raise ValueError(f'Build contains a symlink: {source}')
        if not source.is_file():
            continue
        relative = source.relative_to(build).as_posix()
        safe_path(relative)
        if relative in ('CNAME', '.nojekyll'):
            continue
        name = '/'.join(p for p in (prefix, relative) if p)
        if name.split('/')[0] in ('CNAME', '.git', '.pages-manifests'):
            raise ValueError(f'Reserved file: {name}')
        if name in owners:
            raise ValueError(f'{name} belongs to {owners[name]}')
        # Also reject file/directory collisions before removing the old build.
        if any(parent.as_posix() in owners for parent in PurePosixPath(name).parents):
            raise ValueError(f'Publication would replace another build: {name}')
        if any(owned.startswith(name + '/') for owned in owners):
            raise ValueError(f'Publication would replace another build directory: {name}')
        files[name] = source
    for name in old['files']:
        safe_path(name)
        path = site / name
        if path.is_file():
            path.unlink()
    for name, source in files.items():
        target = site / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    manifest_path.write_text(json.dumps({
        'app': app, 'branch': branch, 'revision': revision,
        'prefix': prefix, 'files': sorted(files),
    }, indent=2) + '\n')
    (site / '.nojekyll').touch()
    print(f'{app}:{branch}: {len(files)} files at /{prefix}')


def git(site, *args, check=True):
    return subprocess.run(['git', '-C', str(site), *args], check=check,
                          text=True, capture_output=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--app', required=True)
    parser.add_argument('--branch', required=True)
    parser.add_argument('--default', required=True)
    parser.add_argument('--classic', action='store_true')
    parser.add_argument('--revision', default='')
    parser.add_argument('--push', action='store_true')
    args = parser.parse_args()
    for attempt in range(5):
        if args.push:
            git(args.site, 'fetch', 'origin', 'gh-pages')
            git(args.site, 'reset', '--hard', 'origin/gh-pages')
            git(args.site, 'clean', '-fd')
        merge(args.site, args.build, args.app, args.branch, args.default, args.classic, args.revision)
        if not args.push:
            return
        git(args.site, 'config', 'user.name', 'github-actions[bot]')
        git(args.site, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
        git(args.site, 'add', '-A')
        if git(args.site, 'diff', '--cached', '--quiet', check=False).returncode == 0:
            print('Published files are already current.')
            return
        git(args.site, 'commit', '-m', f'Publish {args.app}:{args.branch} ({args.revision[:12]})')
        result = git(args.site, 'push', 'origin', 'HEAD:gh-pages', check=False)
        if result.returncode == 0:
            print(result.stderr.strip())
            return
        # Reapply only this build on the latest shared tree if another app won the race.
        print(f'Push did not succeed; refreshing shared site (attempt {attempt + 1}/5).')
        time.sleep(2 + attempt)
    raise SystemExit('Could not publish after five attempts; rerun the workflow.')


if __name__ == '__main__':
    main()
