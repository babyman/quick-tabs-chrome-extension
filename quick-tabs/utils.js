var Utils = {
  IS_FIREFOX: navigator.userAgent.toLowerCase().includes('firefox'),

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
    return function(...args) {
      var context = this;
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

  /**
   * Extracts the actual url from a suspended tab url (The Great Suspender extension e.g.)
   */
  extractSuspendedUrl: function (obj) {
    if (typeof obj?.url !== 'string' || obj?.fullUrl) return;
    obj.fullUrl = obj.url; // full original url, needed for history remove requests
    obj.cleanUrl = obj.url; // un-suspended url with proto, useful for making favicons

    var url = /\/suspend(?:ed)?(?:\.html(?:\?|#)|\/).*ur[il]=(.+)$/.exec(obj.url)?.[1];
    if (url) {
      // check if the url is encoded (not all extensions encode the url)
      if (/^[\w-]+%3A%2F%2F/.test(url)) {
        url = decodeURIComponent(url.split('&')[0]);
      }

      obj.cleanUrl = obj.url = url;
    }

    // url without protocol to search in and display
    obj.url = obj.url.replace(/^https?:\/\/(www\.)?/, '');

    try {
      // decode components of the url for better search
      obj.url = decodeURIComponent(obj.url);
    } catch (e) {}
  },

  /**
   * Sort tabs[] in place based on the order saved by saveTabsOrder()
   */
  restoreTabsOrder: function (tabs) {
    const tabUrls = Config.get(TABS_ORDER);
    if (!tabUrls?.length || !tabs?.length) return;

    const tabOrder = {};
    for (let i = tabUrls.length - 1; i >= 0; i--) {
      tabOrder[tabUrls[i]] = i + 1;
    }

    tabs.sort((a, b) => (tabOrder[a.url] || Number.MAX_VALUE) - (tabOrder[b.url] || Number.MAX_VALUE));
  },

  bg: async function(name, arg) {
    return await chrome.runtime.sendMessage({ call: name, arg });
  },

  /**
  * Log call that sends info to the background page to simplify debugging
  */
  log: function(...args) {
    if (Config.get(DEBUG)) {
      Utils.bg('log', args);
    }
  }

}