"""Self-contained design records, with local-editor link variants."""
from pathlib import Path
import argparse, base64
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
def local_links(text, live='furl.html'):
    for old, new in [('index.html', 'reference.html'), ('studies.html', 'comb-studies.html'), ('live/', live)]:
        for prefix in ['', './']:
            text = text.replace(f'href="{prefix}{old}"', f'href="{new}"')
    return text
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    css = (HERE/'style.css').read_text()
    font = base64.b64encode((REPO/'src/web/www/furl-fonts/PressStart2P-Regular.ttf').read_bytes()).decode()
    css += "\n@font-face{font-family:Furl Pixel;src:url(data:font/ttf;base64,"+font+") format('truetype')}"
    for name in ['offside', 'appearance']:
        html = ((HERE/f'{name}.html').read_text().replace('{{styles}}',css)
                .replace('{{script}}',(HERE/f'{name}.js').read_text()))
        html += '\n<!-- Bundled font license:\n' + (REPO/'src/web/www/furl-fonts/OFL.txt').read_text() + '\n-->\n'
        assert '{{' not in html
        for output, text in [(REPO/f'docs/{name}.html',html), (REPO/f'src/web/www/{name}.html',local_links(html))]:
            if args.check:
                assert output.read_text() == text, f'{output} is stale'
            else: output.write_text(text)
    for original, local in [('index.html','reference.html'), ('studies.html','comb-studies.html'), ('interactions.html','interactions.html')]:
        output = REPO/'src/web/www'/local
        text = local_links((REPO/'docs'/original).read_text())
        if args.check: assert output.read_text() == text, f'{output} is stale'
        else: output.write_text(text)
    print(('Checked'  if args.check else 'Built')+' offside and appearance studies')
if __name__ == '__main__': main()
