'use strict';

/**
 * Alfred-style jump keys for the Quick Tabs popup.
 *
 * Option+1 .. Option+9 jump to results 1-9, Option+0 jumps to result 10.
 * The shortcut hint (e.g. "⌥1") is rendered on the right of each of the
 * first ten visible rows.
 *
 * Matching is by event.code (Digit1..Digit0), not event.key: on a Finnish
 * (and other) macOS layout, Option+digit produces characters like '/', so
 * the key value is unreliable. Callers must preventDefault() so nothing is
 * typed into the search box.
 *
 * Modifier choice: Cmd+digit is the browser's tab-strip jump on macOS, and
 * Ctrl+digit is macOS Spaces switching when that feature is enabled, so
 * both are intercepted before the popup. Option+digit is free.
 *
 * This file is also loadable in Node for unit tests (no DOM access at
 * require time).
 */
var JumpKeys = (function() {
  var KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  var CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];

  /**
   * Map a keyboard event to a result index (0-9), or -1 when the event is
   * not a bare Option+digit jump key. Cmd (metaKey), Ctrl and Shift
   * disqualify. Matching is by event.code only (see file header).
   */
  function indexForKeyEvent(e) {
    if (!e || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
      return -1;
    }
    return CODES.indexOf(e.code || '');
  }

  /** Hint text rendered on the row, e.g. "⌥1" .. "⌥0" (U+2325 OPTION KEY). */
  function hintLabel(index) {
    return '⌥' + KEYS[index];
  }

  /**
   * Append hint badges to the first ten rows. `items` is an array-like of
   * row elements in display order. Idempotent per render: rows are rebuilt
   * from the template on every render, so old hints disappear with them.
   */
  function addHints(items) {
    var count = Math.min(items.length, KEYS.length);
    for (var i = 0; i < count; i++) {
      var hint = document.createElement('span');
      hint.className = 'jumpkey';
      hint.textContent = hintLabel(i);
      hint.setAttribute('aria-hidden', 'true');
      items[i].appendChild(hint);
    }
    return count;
  }

  return {
    KEYS: KEYS,
    indexForKeyEvent: indexForKeyEvent,
    hintLabel: hintLabel,
    addHints: addHints
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = JumpKeys;
}
