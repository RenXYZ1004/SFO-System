import { randomInt } from 'node:crypto';

/**
 * Reference codes runners read out to staff on race day.
 *
 * Format:  SFO-4K7M2X
 *
 * The alphabet deliberately drops every character pair that gets misheard or
 * mistyped at a busy counter:
 *   0 / O   1 / I / L   U (sounds like "you" when spelled aloud)
 * What is left is 30 unambiguous characters, so a code read over a PA system
 * or scribbled on a form still round-trips correctly.
 */

export const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PREFIX = 'SFO';
const LENGTH = 6;

export function newReference() {
  let out = '';
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return `${PREFIX}-${out}`;
}

/** Accepts what a human might type: lowercase, missing prefix, stray spaces. */
export function normaliseReference(input) {
  const cleaned = String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(new RegExp(`^${PREFIX}`), '');
  if (cleaned.length !== LENGTH) return null;
  if ([...cleaned].some((c) => !ALPHABET.includes(c))) return null;
  return `${PREFIX}-${cleaned}`;
}

/** Total possible codes — used by the tests to sanity-check the keyspace. */
export const KEYSPACE = ALPHABET.length ** LENGTH;
