#!/usr/bin/env python3
"""Build two offline HTML documents with only the Python standard library."""
from pathlib import Path
import argparse
import base64
import re

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
OUT = REPO / 'docs'
STUDIES = ('lets', 'functions', 'matches', 'combined', 'recursion', 'traces', 'helper')


def study(study_id, *, switcher=False):
    markup = (HERE / 'study.html').read_text()
    instance = 'study-' + study_id
    if not switcher:
        markup = re.sub(r' <div class="studies".*?</div>\s*', '', markup, count=1, flags=re.S)
        markup = markup.replace('role="tabpanel"', 'role="region"')
        markup = markup.replace('aria-labelledby="{{instance}}-tab-lets"', 'aria-labelledby="heading-' + study_id + '"')
    return markup.replace('{{instance}}', instance).replace('{{study}}', study_id)


def documents():
    styles = '\n'.join((HERE / name).read_text() for name in ('book.css', 'study.css'))
    scripts = '\n'.join((HERE / name).read_text() for name in ('fixtures.js', 'study.js'))
    scripts += "\ndocument.querySelectorAll('.furl-study').forEach(root => mountFurlStudy(root, root.dataset.initialStudy));\n"
    # Standalone native titles supply the old host's supplementary tooltips.
    scripts += "const labelTooltips=()=>document.querySelectorAll('[data-tooltip]').forEach(el=>el.title=el.dataset.tooltip);\nlabelTooltips();\nnew MutationObserver(labelTooltips).observe(document.querySelector('main'),{childList:true,subtree:true});\n"
    nut = (REPO / 'src/web/www/img/hazelnut.svg').read_text().replace('fill: white', 'fill: #607783')
    nut_uri = 'data:image/svg+xml;base64,' + base64.b64encode(nut.encode()).decode()
    page = (HERE / 'page.html').read_text()
    for key in STUDIES:
        page = page.replace('{{study:' + key + '}}', study(key))
    page = page.replace('{{styles}}', styles).replace('{{scripts}}', scripts).replace('{{hazelnut}}', nut_uri)
    sandbox = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>Furl — study switcher</title><style>''' + styles + '''</style></head>
<body><div class="book"><header class="masthead"><a class="wordmark" href="./index.html" aria-label="Furl reference">f<span>u</span>rl</a><nav aria-label="Study links"><a href="./index.html">Read the reference</a><a href="./studies.html" download="furl-studies.html">Save HTML</a></nav></header><main style="margin:28px 0">''' + study('recursion', switcher=True) + '</main></div><script>' + scripts + '</script></body></html>\n'
    return {'index.html': page, 'studies.html': sandbox, '.nojekyll': ''}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if committed output is stale')
    args = parser.parse_args()
    for name, content in documents().items():
        assert '{{' not in content, f'Unresolved template in {name}'
        target = OUT / name
        if args.check:
            if not target.exists() or target.read_text() != content:
                raise SystemExit(f'{target.relative_to(REPO)} is stale; run python3 furl/reference/build.py')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
        print(('Checked ' if args.check else 'Built ') + str(target.relative_to(REPO)))


if __name__ == '__main__':
    main()
