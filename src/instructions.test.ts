import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUCTIONS_MAX_LENGTH, SERVER_INSTRUCTIONS, SERVER_VERSION } from './instructions.js';

test('server instructions fit within the length every client passes on in full', () => {
  // Leave room for a longer version string than the current one.
  const spare = '100.100.100'.length - SERVER_VERSION.length;
  assert.ok(
    SERVER_INSTRUCTIONS.length + spare <= INSTRUCTIONS_MAX_LENGTH,
    `instructions are ${SERVER_INSTRUCTIONS.length} characters; the limit is ${INSTRUCTIONS_MAX_LENGTH}`,
  );
});

test('server instructions name the running version on the first line', () => {
  assert.ok(SERVER_INSTRUCTIONS.split('\n')[0].includes(SERVER_VERSION));
});
