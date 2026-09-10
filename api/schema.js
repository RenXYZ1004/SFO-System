import { FORM, AGREEMENT } from '../lib/form-schema.js';
import { dbConfigured } from '../lib/db.js';

/** Feeds the front-end so the page renders straight from the schema. */
export default function handler(req, res) {
  // Read-only, like the data it returns. Every other route states its verb;
  // this one used to answer any of them.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'GET only' });
  }

  // The schema only changes on a deploy, so let the CDN serve it: the page
  // cannot render its questions until this returns, and a cold serverless
  // start on that path is the slowest thing a first visitor waits for.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');
  res.status(200).json({
    title: FORM.title,
    description: FORM.description,
    configured: dbConfigured(),
    // The waiver box lives on the intro page rather than in the questions,
    // but the page has to submit it under the name the server checks.
    agreement: { name: AGREEMENT.name, label: AGREEMENT.label },
    fields: FORM.fields.map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      required: f.required,
      help: f.help,
      options: f.options,
      // The same options cut into labelled groups, when a flat menu of them
      // would be too long to find anything in. The page falls back to
      // `options` when a question has none.
      optionGroups: f.optionGroups,
      maxLength: f.maxLength,
      section: f.section,
      // Where the question is drawn (main flow, or a named pop-up panel)
      // and what has to be answered before it is asked at all.
      panel: f.panel,
      showIf: f.showIf,
      placeholder: f.placeholder,
      // Shipped so the page can flag a bad format before a round-trip;
      // the server checks the same rule again regardless.
      pattern: f.pattern,
      patternMessage: f.patternMessage,
      // The measurements behind the shirt size guide, and the cuts they are
      // grouped into. Nothing on the server reads them; they travel with the
      // options they describe so the page cannot end up charting a different
      // set of sizes than it offers.
      sizeChart: f.sizeChart,
    })),
  });
}
