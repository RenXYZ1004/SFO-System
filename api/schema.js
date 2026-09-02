import { FORM } from '../lib/form-schema.js';
import { dbConfigured } from '../lib/db.js';

/** Feeds the front-end so the page renders straight from the schema. */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60');
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
    })),
  });
}
