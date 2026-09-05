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
    actions, stages = inventory['actions'], inventory['stages']
    ids = [item['id'] for item in actions]
    assert len(set(ids)) == len(ids), 'Duplicate action ID'
    stage_ids = {stage['id'] for stage in stages}
    assert len(stage_ids) == len(stages), 'Duplicate stage ID'
    assert all(item['stage'] in stage_ids for item in actions), 'Unknown stage'
    labels = {'working': '✓ Implemented', 'partial': '◐ Partial',
              'storyboard': '◇ Before/after only', 'todo': '○ To do', 'none': '— Not in this study'}
    def coverage(item, platform):
        state = item[platform]
        label = labels[state]
        if platform == 'hazel' and state == 'todo':
            label = '○ Awaiting port' if item['study'] == 'working' else '○ Not implemented'
        title = 'Study' if platform == 'study' else 'Hazel-backed Furl'
        link = ''
        if platform == 'study' and item.get('demo'):
            link = '<a href="#' + escape(item['demo'], quote=True) + '">Try example ' + ('01' if item['demo'] == 'rows' else '02') + '</a>'
        elif platform == 'study' and item.get('story'):
            link = '<a href="#transformations" data-story="' + escape(item['story'], quote=True) + '">See storyboard</a>'
        elif platform == 'hazel' and state in ('working', 'partial'):
            link = '<a href="./live/">Open live editor</a>'
        return '<div class="coverage"><span class="coverage-platform">' + title + '</span><span class="coverage-state ' + state + '">' + label + '</span><p>' + escape(item[platform + '_detail']) + '</p>' + link + '</div>'
    groups, links, options = [], [], []
    for stage in stages:
        items = [item for item in actions if item['stage'] == stage['id']]
        if stage['id'] == 'working':
            assert all(item['study'] == 'working' or item['hazel'] == 'working' for item in items), 'Implemented stage needs a working slice'
        rows = []
        for item in items:
            source = escape(item['source'])
            if item['url']:
                source = '<a href="' + escape(item['url'], quote=True) + '">' + source + '</a>'
            first = '<a class="action-id" href="#action-' + item['id'] + '">' + item['id'] + '</a><strong>' + escape(item['action']) + '</strong><span class="target-kind">Target · ' + escape(item['target']) + '</span><span class="target-kind">Operation · ' + escape(item['semantic']) + '</span><details class="action-evidence"><summary>Evidence · ' + escape(item['origin']) + '</summary>' + source + '</details>'
            progress = coverage(item, 'study') + coverage(item, 'hazel')
            next_step = '<p>' + escape(item['next']) + '</p><details><summary>Conditions / limits</summary><p>' + escape(item['rule']) + '</p></details>'
            inputs = '<p><b>Mouse</b> · ' + escape(item['mouse']) + '</p><p><b>Keyboard</b> · ' + escape(item['keyboard']) + '</p>'
            rows.append('<tr id="action-' + item['id'] + '" data-action-id="' + item['id'] + '" data-origin="' + escape(item['origin'], quote=True) + '" data-stage="' + stage['id'] + '" data-study="' + item['study'] + '" data-hazel="' + item['hazel'] + '">' + ''.join('<td>' + cell + '</td>' for cell in (first, progress, next_step, inputs)) + '</tr>')
        heading = '<summary><span>' + escape(stage['title']) + '</span><span class="stage-count">' + str(len(items)) + ' actions</span></summary>'
        table = '<div class="table-scroll"><table><caption class="sr-only">' + escape(stage['title']) + '</caption><thead><tr><th>Action / target</th><th>What works today</th><th>Next step</th><th>Mouse / keyboard</th></tr></thead><tbody>' + '\n'.join(rows) + '</tbody></table></div>'
        groups.append('<details class="inventory-stage" id="inventory-' + stage['id'] + '" data-stage="' + stage['id'] + '"' + (' open' if stage['open'] else '') + '>' + heading + '<p class="stage-summary">' + escape(stage['summary']) + '</p>' + table + '</details>')
        links.append('<a href="#inventory-' + stage['id'] + '" data-stage-link="' + stage['id'] + '">' + escape(stage['title'].split(' · ')[0]) + ' <span>' + str(len(items)) + '</span></a>')
        options.append('<option value="' + stage['id'] + '">' + escape(stage['title']) + '</option>')
    styles = (REPO / 'furl/reference/book.css').read_text() + '\n' + (HERE / 'style.css').read_text()
    scripts = '\n'.join((HERE / name).read_text() for name in ('stories.js', 'wire.js', 'study.js'))
    result = (HERE / 'page.html').read_text().replace('{{styles}}', styles).replace('{{scripts}}', scripts).replace('{{inventory}}', '\n'.join(groups)).replace('{{stage_links}}', ''.join(links)).replace('{{stage_options}}', ''.join(options))
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
