'use strict';

const AUTO_SEARCH_BOOKMARKS = 'auto_search_bookmarks';
const CLOSE_TAB_POPUP = 'close_tab_popup';
const CLOSED_TABS_SIZE = 'closed_tabs_size';
const CLOSED_TABS = 'closed_tabs';
const CLOSED_TABS_LIST_SAVE = 'closed_tabs_list_save';
const CUSTOM_CSS = 'custom_css';
const DEBOUNCE_DELAY = 'debounce_delay';
const DEBUG = 'debug';
const HISTORY_FILTER = 'history_filter';
const INCLUDE_DEV_TOOLS = 'include_dev_tools';
const INSTALLED_AT = 'installed_at';
const JUMP_TO_LATEST_TAB_ON_CLOSE = 'jumpTo_latestTab_onClose';
const KEY_POPUP = 'key_popup';
const LAST_SEARCHED_STR = 'last_searched_str';
const MOVE_LEFT_ON_SWITCH = 'move_left_on_switch';
/**
 * fix for #296 - Would it be possible to have an additional checkbox that enables the previous behaviour so that "Move tab to rightmost position on switch"
 * only applies if I have actually activated the extension, instead of applying all the time?
 */
const MOVE_ON_POPUP_SWITCH_ONLY = 'move_on_popup_switch_only';
// IMPORTANT: "move_on_switch" is a legacy name, do not change
const MOVE_ON_SWITCH = 'move_on_switch';
const NEW_TAB_POPUP = 'new_tab_popup';
const ORDER_TABS_BY_URL = 'order_tabs_by_url';
const ORDER_TABS_IN_WINDOW_ORDER = 'order_tabs_in_window_order';
const PAGEUP_PAGEDOWN_SKIP_SIZE = 'pageup_pagedown_skip_size';
const RESTORE_LAST_SEARCHED_STR = 'restore_last_searched_str';
const SEARCH_FUZZY = 'search_fuzzy';
const SEARCH_STRING = 'search_string';
const SEARCH_TYPE = 'search_type';
const SEARCH_URLS = 'search_urls';
const SHOW_FAVICONS = 'show_favicons';
const SHOW_PINNED_TABS = 'show_pinned_tabs';
const SHOW_TAB_COUNT = 'show_tab_count';
const SHOW_TOOLTIPS = 'show_tooltips';
const SHOW_URLS = 'show_urls';
const TAB_ORDER_UPDATE_DELAY = 'tab_order_update_delay';

var Config = (function() {
  let data = {};

  return {
    init: async function () {
      let opt = await chrome.storage.local.get(INSTALLED_AT);
      if (!opt[INSTALLED_AT] && typeof window === 'object') {
        // transfer from localStorage to chrome.storage.local
        let storageCopy = Object.assign({}, window.localStorage || {});
        Object.entries(storageCopy).forEach(([k, v]) => { storageCopy[k] = v === 'true' ? true : v === 'false' ? false : v });
        await chrome.storage.local.set(storageCopy);
        chrome.storage.local.set({ [INSTALLED_AT]: Date.now() });
      }

      data = await chrome.storage.local.get(null);

      // default values
      data[SEARCH_STRING] ??= 'https://www.google.com/search?q=%s';
      data[CLOSE_TAB_POPUP] ??= '{"ctrl": true, "key": "d"}';
      data[NEW_TAB_POPUP] ??= '{"ctrl": true, "key": "return"}';
      data[PAGEUP_PAGEDOWN_SKIP_SIZE] ??= 5;
      data[CLOSED_TABS_SIZE] ??= 10;
      data[CLOSED_TABS_LIST_SAVE] ??= true;
      data[MOVE_ON_POPUP_SWITCH_ONLY] ??= true;
      data[SHOW_FAVICONS] ??= true;
      data[SHOW_TAB_COUNT] ??= true;
      data[SHOW_TOOLTIPS] ??= true;
      data[SHOW_URLS] ??= true;
      data[SHOW_PINNED_TABS] ??= true;
      data[AUTO_SEARCH_BOOKMARKS] ??= true;
    },

    get: function (key) {
      return data[key];
    },

    set: async function (key, value) {
      data[key] = value;
      await chrome.storage.local.set({ [key]: value });
    },

    getKeyCombo: function (savedAs) {
      if (data[savedAs]?.startsWith("{")) {
        return new ShortcutKey(JSON.parse(data[savedAs]));
      } else {
        return new ShortcutKey({});
      }
    },

    setKeyCombo: function (saveAs, key) {
      if (saveAs === NEW_TAB_POPUP) {
        key.key = 'return'; // always use return to trigger this =)
      }
      data[saveAs] = JSON.stringify(key);
    },

    includeTab: function (tab) {
      return !(!this.get(INCLUDE_DEV_TOOLS) && /chrome-devtools:\/\//.exec(tab.url)) && !(!this.get(SHOW_PINNED_TABS) && tab.pinned);
    },

    /**
     * make sure the tab is usable for search etc (see PR #314 and related issues #251, #310, #275, #313).
     */
    validTab: function (tab) {
      return tab && tab.title;
    }
  };

})();

function ShortcutKey(properties) {
  this.ctrl = properties.ctrl || false;
  this.shift = properties.shift || false;
  this.alt = properties.alt || false;
  this.meta = properties.meta || false;
  this.key = properties.key || '';
}

ShortcutKey.prototype.pattern = function() {
  return (this.alt ? "alt_" : "")
      + (this.meta ? "meta_" : "")
      + (this.ctrl ? "ctrl_" : "")
      + (this.shift ? "shift_" : "")
      + (this.key);
};
