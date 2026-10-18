import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normaliseProfileUrl, yearsOfExperience } from '../lib/outreach.mjs';

test('normaliseProfileUrl keeps only real /in/ profile links', () => {
  assert.equal(normaliseProfileUrl('https://in.linkedin.com/in/Priya-Sharma-12ab/?trk=x'), 'https://www.linkedin.com/in/priya-sharma-12ab');
  assert.equal(normaliseProfileUrl('http://linkedin.com/in/rahul'), 'https://www.linkedin.com/in/rahul');
  assert.equal(normaliseProfileUrl('https://www.linkedin.com/company/razorpay'), null);
  assert.equal(normaliseProfileUrl('https://www.linkedin.com/in/rahul/details/experience'), null);
  assert.equal(normaliseProfileUrl('https://evil.com/linkedin.com/in/rahul'), null);
  assert.equal(normaliseProfileUrl(''), null);
});

test('yearsOfExperience reads like "2+"', () => {
  assert.match(yearsOfExperience(), /^(\d+\+?|several)$/);
});
