/**
 * Builds the exact clone from a form you can only open while signed in.
 *
 *   node tools/import-form-source.js <file> [--url <formResponse-url>]
 *
 * <file> can be either:
 *   a) a page saved from the browser  (Ctrl+S -> "Webpage, HTML Only"), or
 *   b) a .json/.txt file holding the FB_PUBLIC_LOAD_DATA_ array that the
 *      console snippet below copies to your clipboard.
 *
 * Console snippet — run it on the open form, signed in:
 *
 *   copy(JSON.stringify(FB_PUBLIC_LOAD_DATA_))
 *
 * then paste into a file and point this script at it.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extractPayload, parseForm, buildSchemaFile, printSummary } from '../lib/parse-form.js';
import { FORM } from '../lib/form-schema.js';

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const urlIdx = args.indexOf('--url');
  const urlArg = urlIdx > -1 ? args[urlIdx + 1] : null;

  if (!file) {
    console.error('Usage: node tools/import-form-source.js <saved-page.html|payload.json> [--url <formResponse-url>]');
    console.error('\nTo get the payload: open the form signed in, press F12, and run:');
    console.error('  copy(JSON.stringify(FB_PUBLIC_LOAD_DATA_))');
    return 1;
  }
  if (!existsSync(file)) {
    console.error(`No such file: ${file}`);
    return 1;
  }

  const raw = readFileSync(file, 'utf8').trim();

  let data = null;
  let sourceKind = '';

  if (raw.startsWith('[')) {
    try { data = JSON.parse(raw); sourceKind = 'pasted FB_PUBLIC_LOAD_DATA_ payload'; }
    catch (e) { console.error(`That file starts with "[" but is not valid JSON: ${e.message}`); return 3; }
  } else {
    data = extractPayload(raw);
    sourceKind = 'saved HTML page';
    if (!data) {
      console.error('Could not find FB_PUBLIC_LOAD_DATA_ in that file.\n');
      console.error('If you saved the page, make sure you chose "Webpage, HTML Only"');
      console.error('(the "Complete" option rewrites the scripts).\n');
      console.error('Easier: open the form signed in, press F12, run this, and save the result:');
      console.error('  copy(JSON.stringify(FB_PUBLIC_LOAD_DATA_))');
      return 2;
    }
  }

  // Work out where submissions should be posted.
  let responseUrl = urlArg || '';
  if (!responseUrl) {
    // data[14] carries the form's response id on current forms.
    const respId = typeof data?.[14] === 'string' ? data[14] : null;
    const inHtml = raw.match(/\/forms\/d\/e\/([A-Za-z0-9_-]{20,})\//);
    const id = respId || inHtml?.[1];
    responseUrl = id
      ? `https://docs.google.com/forms/d/e/${id}/formResponse`
      : FORM.responseUrl;
  }
  responseUrl = responseUrl.replace(/\/viewform.*$/, '/formResponse');

  const parsed = parseForm(data);
  if (!parsed.fields.length) {
    console.error('Parsed the payload but found no answerable questions.');
    return 4;
  }

  console.log(`Source: ${sourceKind}`);
  console.log(`Post to: ${responseUrl}\n`);
  printSummary(parsed);

  writeFileSync(
    new URL('../lib/form-schema.js', import.meta.url),
    buildSchemaFile({ responseUrl, ...parsed })
  );
  console.log('\nWrote lib/form-schema.js — the web form now mirrors the Google Form exactly.');
  return 0;
}

process.exitCode = main();
