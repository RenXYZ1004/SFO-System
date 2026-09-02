/**
 * Reads the source Google Form and rewrites lib/form-schema.js so the cloned
 * web page matches it exactly — questions, order, required flags and choices.
 *
 *   node tools/fetch-form-schema.js [viewform-url]
 *
 * Requires the form to be shared as "Anyone with the link". If it is still
 * restricted, use tools/import-form-source.js instead.
 */
import { writeFileSync } from 'node:fs';
import { extractPayload, parseForm, buildSchemaFile, printSummary } from '../lib/parse-form.js';
import { FORM } from '../lib/form-schema.js';

async function main() {
  const arg = process.argv[2] || FORM.responseUrl;
  const viewUrl = arg.replace(/\/formResponse.*$/, '/viewform');
  const responseUrl = viewUrl.replace(/\/viewform.*$/, '/formResponse');

  console.log(`Fetching: ${viewUrl}\n`);

  let html;
  try {
    html = await (await fetch(viewUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' },
    })).text();
  } catch (err) {
    console.error(`Could not reach the form: ${err.message}`);
    return 1;
  }

  const data = extractPayload(html);
  if (!data) {
    console.error('Could not read the form anonymously — it still requires sign-in.\n');
    console.error('Either:');
    console.error('  A) open the form -> Settings -> Responses -> turn OFF');
    console.error('     "Restrict to users in <your org>", then re-run this; or');
    console.error('  B) open the form while signed in, press F12, run:\n');
    console.error('       copy(JSON.stringify(FB_PUBLIC_LOAD_DATA_))\n');
    console.error('     paste that into a file, then run:');
    console.error('       node tools/import-form-source.js <that-file> --url <formResponse-url>\n');
    return 2;
  }

  const parsed = parseForm(data);
  if (!parsed.fields.length) { console.error('No answerable questions found.'); return 4; }

  printSummary(parsed);
  writeFileSync(
    new URL('../lib/form-schema.js', import.meta.url),
    buildSchemaFile(parsed)
  );
  console.log('\nWrote lib/form-schema.js — the web form now mirrors the Google Form.');
  return 0;
}

process.exitCode = await main();
