/* Most interaction suites use the full toolbar. Pin that fixture preference;
 * test-zen and test-loading exercise the actual fresh-browser defaults. */
module.exports = (page) =>
  page.addInitScript(() => {
    const key = "furl.preferences.v1";
    const prefs = JSON.parse(localStorage.getItem(key) || "{}");
    if (prefs.zen === undefined)
      localStorage.setItem(key, JSON.stringify({ ...prefs, zen: false }));
  });
