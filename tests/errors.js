// Collects page errors, console errors and failed requests for a Playwright test to assert on at the end. Failed
// resource loads are checked by URL, so requests to `external` hosts (web fonts by default) being offline don't fail a run.
export function watchErrors(page, external = /fonts\.(googleapis|gstatic)\.com/) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('requestfailed', r => { if (!external.test(r.url())) errors.push(`request failed: ${r.url()}`); });
  return errors;
}
