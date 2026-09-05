#!/usr/bin/env python3
"""Compile the live Hazel-backed Furl entry point and package it for Pages.

Requires the Hazel opam toolchain (see INSTALL.md). The reference build remains
independent. Only docs/live is generated here; no upstream deployment runs.
"""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[2]
WWW = REPO / 'src/web/www'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Build and check committed live output')
    args = parser.parse_args()
    subprocess.run(['opam', 'exec', '--', 'dune', 'build',
                    'src/web/www/furl.js', '--profile', 'release'], cwd=REPO, check=True)
    output = REPO / 'docs/live'
    with tempfile.TemporaryDirectory(prefix='furl-live-') as temp:
        stage = Path(temp)
        shutil.copyfile(WWW / 'furl.html', stage / 'index.html')
        shutil.copyfile(WWW / 'navigation.html', stage / 'navigation.html')
        shutil.copyfile(REPO / '_build/default/src/web/www/furl.js', stage / 'furl.js')
        shutil.copyfile(WWW / 'furl.css', stage / 'furl.css')
        # The root stylesheet's inherited pin icon path is relative to style/;
        # here the stylesheet itself lives at the app root.
        (stage / 'style.css').write_text((WWW / 'style.css').read_text().replace('../img/', 'img/'))
        for name in ('style', 'img'):
            shutil.copytree(WWW / name, stage / name, ignore=shutil.ignore_patterns('*.html'))
        for stylesheet in stage.rglob('*.css'):
            stylesheet.write_text(stylesheet.read_text().rstrip() + '\n')
        files = sorted(p.relative_to(stage) for p in stage.rglob('*') if p.is_file())
        if args.check:
            existing = sorted(p.relative_to(output) for p in output.rglob('*') if p.is_file())
            if existing != files or any((output / p).read_bytes() != (stage / p).read_bytes() for p in files):
                raise SystemExit('docs/live is stale; run python3 furl/live/build.py')
        else:
            if output.exists():
                shutil.rmtree(output)
            shutil.copytree(stage, output)
        total = sum((stage / p).stat().st_size for p in files)
        print(f'{"Checked" if args.check else "Built"} docs/live: {len(files)} files, {total / 1_000_000:.1f} MB')


if __name__ == '__main__':
    main()
