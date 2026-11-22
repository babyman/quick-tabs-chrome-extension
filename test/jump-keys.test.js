'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const JumpKeys = require('../quick-tabs/js/jump-keys.js');

function ev(overrides) {
  return Object.assign(
    { key: '', code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
    overrides
  );
}

test('option+digit maps to result index 0-9 via event.code', () => {
  assert.equal(JumpKeys.indexForKeyEvent(ev({ code: 'Digit1', altKey: true })), 0);
  assert.equal(JumpKeys.indexForKeyEvent(ev({ code: 'Digit5', altKey: true })), 4);
  assert.equal(JumpKeys.indexForKeyEvent(ev({ code: 'Digit9', altKey: true })), 8);
  assert.equal(JumpKeys.indexForKeyEvent(ev({ code: 'Digit0', altKey: true })), 9);
});

test('matches even when Option+digit produces a special character (Finnish layout)', () => {
  // Option+1 on a Finnish macOS layout types '/', Option+2 types '"', etc.
  assert.equal(JumpKeys.indexForKeyEvent(ev({ key: '/', code: 'Digit1', altKey: true })), 0);
  assert.equal(JumpKeys.indexForKeyEvent(ev({ key: '”', code: 'Digit2', altKey: true })), 1);
  assert.equal(JumpKeys.indexForKeyEvent(ev({ key: '»', code: 'Digit4', altKey: true })), 3);
});

test('cmd (meta) is rejected: browser tab-strip jump on macOS stays untouched', () => {
  assert.equal(JumpKeys.indexForKeyEvent(ev({ key: '1', code: 'Digit1', metaKey: true })), -1);
  assert.equal(JumpKeys.indexForKeyEvent(ev({ code: 'Digit1', altKey: true, metaKey: true })), -1);
});

test('ctrl is rejected: macOS Spaces switching and browser reservations', () => {
  assert.equal(JumpKeys.indexForKeyEvent(ev({ key: '1', code: 'Digit1', ctrlKey: true })), -1);
  assert.equal(JumpKeys.indexForKeyEvent(ev({ code: 'Digit1', altKey: true, ctrlKey: true })), -1);
});

test('shift is rejected', () => {
  assert.equal(JumpKeys.indexForKeyEvent(ev({ key: '¡', code: 'Digit1', altKey: true, shiftKey: true })), -1);
});

test('plain digits without option are rejected', () => {
  assert.equal(JumpKeys.indexForKeyEvent(ev({ key: '1', code: 'Digit1' })), -1);
});

test('non-digit keys and malformed events are rejected', () => {
  assert.equal(JumpKeys.indexForKeyEvent(ev({ key: 'å', code: 'KeyA', altKey: true })), -1);
  assert.equal(JumpKeys.indexForKeyEvent(ev({ altKey: true })), -1);
  assert.equal(JumpKeys.indexForKeyEvent(null), -1);
  assert.equal(JumpKeys.indexForKeyEvent(undefined), -1);
});

test('hint labels follow Alfred order: 1..9 then 0 for the tenth', () => {
  assert.equal(JumpKeys.hintLabel(0), '⌥1');
  assert.equal(JumpKeys.hintLabel(8), '⌥9');
  assert.equal(JumpKeys.hintLabel(9), '⌥0');
});

test('indexForKeyEvent and hintLabel agree on ordering', () => {
  for (let i = 0; i < JumpKeys.KEYS.length; i++) {
    const digit = JumpKeys.KEYS[i];
    const idx = JumpKeys.indexForKeyEvent(ev({ code: 'Digit' + digit, altKey: true }));
    assert.equal(JumpKeys.hintLabel(idx), '⌥' + digit);
  }
});
