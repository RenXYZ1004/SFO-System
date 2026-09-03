import { FORM } from '../lib/form-schema.js';
import { dbConfigured } from '../lib/db.js';

/** Feeds the front-end so the page renders straight from the schema. */
export default function handler(req, res) {
  // The schema only changes on a deploy, so let the CDN serve it: the page
  // cannot render its questions until this returns, and a cold serverless
  // start on that path is the slowest thing a first visitor waits for.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');
  res.status(200).json({
    title: FORM.title,
    description: FORM.description,
    configured: dbConfigured(),
    fields: FORM.fields.map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      required: f.required,
      help: f.help,
      options: f.options,
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
    })),
  });
}
