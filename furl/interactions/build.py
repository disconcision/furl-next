#!/usr/bin/env python3
"""Build the self-contained Furl interaction study using the standard library."""
from pathlib import Path
from html import escape
import argparse
import json

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]

def document():
    inventory = json.loads((HERE / 'inventory.json').read_text())
    rows = []
    for item in inventory:
        source = escape(item['source'])
        if item['url']:
            source = '<a href="' + escape(item['url'], quote=True) + '">' + source + '</a>'
        first = '<strong>' + escape(item['action']) + '</strong><span class="origin">' + escape(item['origin']) + ' · ' + escape(item['phase']) + '</span><span class="evidence">' + source + '</span>'
        cells = [first] + [escape(item[key]) for key in ('mouse', 'keyboard', 'rule')]
        rows.append('<tr data-origin="' + escape(item['origin'], quote=True) + '">' + ''.join('<td>' + cell + '</td>' for cell in cells) + '</tr>')
    styles = (REPO / 'furl/reference/book.css').read_text() + '\n' + (HERE / 'style.css').read_text()
    scripts = '\n'.join((HERE / name).read_text() for name in ('stories.js', 'study.js'))
    result = (HERE / 'page.html').read_text().replace('{{styles}}', styles).replace('{{scripts}}', scripts).replace('{{inventory}}', '\n'.join(rows))
    assert '{{' not in result, 'Unresolved template'
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    output = REPO / 'docs/interactions.html'
    content = document()
    if args.check:
        if not output.exists() or output.read_text() != content:
            raise SystemExit('docs/interactions.html is stale; run python3 furl/interactions/build.py')
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(content)
    print(('Checked ' if args.check else 'Built ') + 'docs/interactions.html')

if __name__ == '__main__':
    main()
