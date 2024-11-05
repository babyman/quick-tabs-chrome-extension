var Utils = {
  includeTab: function (tab) {
    return !(!Config.get(INCLUDE_DEV_TOOLS) && /chrome-devtools:\/\//.exec(tab.url)) && !(!Config.get(SHOW_PINNED_TABS) && tab.pinned);
  },

  /**
   * make sure the tab is usable for search etc (see PR #314 and related issues #251, #310, #275, #313).
   */
  validTab: function (tab) {
    return tab && tab.title;
  },

  /**
   * Returns a function, that, as long as it continues to be invoked, will not
   * be triggered. The function will be called after it stops being called for
   * N milliseconds. If `immediate` is passed, trigger the function on the
   * leading edge, instead of the trailing.
   */
  debounce: function (func, wait, immediate) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      clearTimeout(timeout);
      //Moving this line above timeout assignment
      if (immediate && !timeout) {
        func.apply(context, args);
      }
      timeout = setTimeout(function() {
        timeout = null;
        if (!immediate) {
          func.apply(context, args);
        }
      }, wait);
    };
  },
}