import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publish', Path(__file__).with_name('publish.py'))
publish = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publish)


class SharedSiteTests(unittest.TestCase):
    def test_updates_preserve_other_apps_and_branches_and_remove_stale_assets(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            site = root / 'site'
            site.mkdir()
            for name, branch, classic, files in [
                ('modern', 'main', False, ['index.html', 'old.js']),
                ('classic', 'main', True, ['index.html', 'old.js']),
                ('modern', 'feature/nested', False, ['index.html']),
            ]:
                build = root / f'{name}-{classic}'
                build.mkdir(exist_ok=True)
                for f in files:
                    (build / f).write_text(name)
                publish.merge(site, build, name, branch, 'main', classic, 'first')
            build = root / 'replacement'
            build.mkdir()
            (build / 'index.html').write_text('updated')
            publish.merge(site, build, 'modern', 'main', 'main', False, 'second')
            self.assertEqual((site / 'index.html').read_text(), 'updated')
            self.assertFalse((site / 'old.js').exists())
            self.assertTrue((site / 'classic/old.js').exists())
            self.assertTrue((site / 'feature/nested/index.html').exists())

    def test_collision_fails_before_removing_existing_build(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            site, build = root / 'site', root / 'build'
            site.mkdir()
            build.mkdir()
            (build / 'index.html').write_text('classic')
            publish.merge(site, build, 'classic', 'main', 'main', True, 'one')
            (build / 'classic').mkdir()
            (build / 'classic/index.html').write_text('wrong')
            with self.assertRaises(ValueError):
                publish.merge(site, build, 'modern', 'main', 'main', False, 'two')
            self.assertEqual((site / 'classic/index.html').read_text(), 'classic')

    def test_paths(self):
        self.assertEqual(publish.destination('codex/canopy-growth', 'main', False), 'codex/canopy-growth')
        self.assertEqual(publish.destination('main', 'main', True), 'classic')
        for branch in ('../oops', '/absolute', 'classic', '.git', 'feature//oops'):
            with self.assertRaises(ValueError):
                publish.destination(branch, 'main', False)


if __name__ == '__main__':
    unittest.main()
