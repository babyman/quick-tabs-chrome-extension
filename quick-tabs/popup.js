/*
 Copyright (c) 2009 - 2019, Evan Jehu
 All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:
 * Redistributions of source code must retain the above copyright
 notice, this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
 notice, this list of conditions and the following disclaimer in the
 documentation and/or other materials provided with the distribution.
 * Neither the name of the author nor the
 names of its contributors may be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 DISCLAIMED. IN NO EVENT SHALL EVAN JEHU BE LIABLE FOR ANY
 DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

"use strict";

import Fuse from './js/fuse.min.js'

(async function() {

const bg = Utils.bg;

await Config.init();

if (getUrlParameter('firstRun') === 'true') {
  await chrome.runtime.sendMessage({ firstRun: true });
}

let bgBookmarks = [];
let bgTabs = [];
let bgClosedTabs = [];

/**
 * connect to the background page on opening
 */
var bgMessagePort = chrome.runtime.connect({name: "qtPopup"});

/**
 * log name constant
 */
const LOG_SRC = "POPUP";
const log = Utils.log.bind(undefined, LOG_SRC);

/**
 * empty variable used to cache the browser history once it has been loaded
 */
var historyCache = null;

/**
 * the search implementation to be used when search tabs
 */
var search = null;

/**
 * max number of search results to show when searching bookmarks and history.
 */
const MAX_NON_TAB_RESULTS = 100;

/**
 * the number of milliseconds to wait before triggering the search when the user is entering a search query
 */
let debounceDelay = Config.get(DEBOUNCE_DELAY);

/**
 * minimum tabs required before bookmarks get searched automatically.
 */
const MIN_TAB_ONLY_RESULTS = Config.get(AUTO_SEARCH_BOOKMARKS) ? 5 : 0;

/**
 * debug variable, can be used to prevent the window closing after an action has completed.  Useful if the popup window is opened in a
 * standard chrome tab for troubleshooting.
 *
 * chrome-extension://jnjfeinjfmenlddahdjdmgpbokiacbbb/popup.html
 *
 */
var autoClose = getUrlParameter('popup') === 'true';

/**
 * Simple little timer class to help with optimizations
 */
function Timer() {
  this.start = this.last = (new Date).getTime();
}

Timer.prototype.log = function(...args) {
  var now = (new Date).getTime();
  args.push("total time " + (now - this.start) + " m/s, delta " + (now - this.last) + " m/s");
  log.apply(this, args);
  this.last = now;
};
Timer.prototype.reset = function() {
  this.start = this.last = (new Date).getTime();
};

/**
 * timer to record page initialization events
 */
var pageTimer = new Timer();

async function loadTabs() {
  bgTabs = await bg('getTabs') || [];
}

async function loadClosedTabs() {
  bgClosedTabs = [];

  const recClosed = await chrome.sessions.getRecentlyClosed();
  recClosed.map(t => {
    let tabs = t.window?.tabs || [t.tab];
    for (const tab of tabs) {
      if (!t.window || tab.index >= 0) {
        Utils.extractSuspendedUrl(tab);
        bgClosedTabs.push(tab);
      }
    }
  });
}

function openInNewTab(url) {
  log("opening new tab", url);
  chrome.tabs.create({url: url, index: 1000});
  return closeWindow();
}

function restoreSession(id) {
  chrome.sessions.restore(id);
  return closeWindow();
}

function closeWindow() {
  if (autoClose) {
    /**
     * unbind document events before closing the popup window, see issue
     * Chrome shortcuts do not work immediately after using quicktabs #95
     */
    log("Unbinding document event handlers.");
    $(document).unbind(); // do both unbind and off, just to be sure.
    $(document).off();
    window.close();
  } else {
    log("Window close prevented by autoClose setting.");
  }
  return false;
}

async function closeTabs(tabIds) {
  bg('recordTabsRemoved', tabIds);
  const promises = [];
  for (var x = 0; x < tabIds.length; x++) {
    var tabId = tabIds[x];
    $("#" + tabId).addClass('closing').fadeOut("fast", function () { this.remove() });
    promises.push(chrome.tabs.remove(tabId));
  }
  await Promise.all(promises);
}

function entryWithFocus() {
  return $(".withfocus");
}

function isFocusSet() {
  return entryWithFocus().length > 0;
}

function scrollToFocus(scrollToTop, direction) {
  const element = entryWithFocus()[0];
  const scrollElement = document.querySelector('.content');
  if (!scrollElement) return;

  // make sure we have an element to scroll to
  if (element) {
    const elOffset = element.offsetTop;
    const elHeight = element.offsetHeight;

    const visibleAreaStart = scrollElement.scrollTop;
    const visibleAreaEnd = visibleAreaStart + scrollElement.clientHeight;

    if (elOffset < visibleAreaStart + elHeight || scrollToTop) {
      // scrolling down - moving the focused element to the top of the visible area
      scroll(scrollElement, elOffset - elHeight);
    } else if (elOffset > visibleAreaEnd - elHeight * 2) {
      // scrolling up - moving the focused element to the bottom of the visible area
      scroll(scrollElement, elOffset - scrollElement.clientHeight + elHeight * 2);
    }

  // if there is no focused element and direction is specified then scroll by pixels (to scroll the help page)
  } else if (Number.isInteger(direction)) {
    scroll(scrollElement, scrollElement.scrollTop + (50 * direction));
  }
}

// if user has not set the option manually then use the configuration from the system
const useSmoothScroll = Config.get(SMOOTH_SCROLL) ?? !window.matchMedia('(prefers-reduced-motion)').matches;

let scrollPrevTop = 0;
let scrollTimeout;
function scroll(elem, top) {
  top = Math.max(0, Math.min(top, elem.scrollHeight - elem.clientHeight));
  if (top === elem.scrollTop) return;

  if (useSmoothScroll) {
    let delay = 0;
    if (elem.scrollTop !== scrollPrevTop) {
      $(elem).stop();
      elem.scrollTop = scrollPrevTop;
      delay = 30;
    }

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(scrollAnimate, delay, elem, top);
  } else {
    elem.scrollTop = top;
  }
  scrollPrevTop = top;
}

function scrollAnimate(elem, top) {
  $(elem).animate({ scrollTop: top }, 200);
}

function focus(elem, scrollToTop) {
  entryWithFocus().removeClass('withfocus');
  elem.addClass('withfocus');
  scrollToFocus(scrollToTop);
}

function focusNone() {
  entryWithFocus().removeClass('withfocus');
}

function focusFirst(scrollTop) {
  if (scrollTop === true) {
    document.querySelector('.content').scrollTop = 0;
    scrollPrevTop = 0;
  }

  const prevAfterSeparator = entryWithFocus().prevAll('.separator + .item').eq(0);
  if (prevAfterSeparator.length > 0) {
    focus(prevAfterSeparator);
  } else {
    focus($(".item:first"));
  }
  return false;
}

function focusLast() {
  const nextAfterSeparator = entryWithFocus().nextAll('.separator + .item').eq(0);
  if (nextAfterSeparator.length > 0) {
    focus(nextAfterSeparator, true);
  } else {
    focus($(".item:last"));
  }
  return false;
}

function focusPrev(ev, skip = 1) {
  ev?.stopImmediatePropagation?.();
  entryWithFocus().removeClass('withfocus').prevAll(".item").eq(skip - 1).addClass('withfocus');
  if (!isFocusSet()) {
    // check ev.repeat to make a 'soft bump' when holding down a key, so we cannot wrap around accidentally
    (skip === 1 && !ev?.originalEvent.repeat ? focusLast : focusFirst)();
  }

  scrollToFocus(undefined, -1 * skip);
  return false;
}

function focusNext(ev, skip = 1) {
  ev?.stopImmediatePropagation?.();
  entryWithFocus().removeClass('withfocus').nextAll(".item").eq(skip - 1).addClass('withfocus');
  if (!isFocusSet()) {
    (skip === 1 && !ev?.originalEvent.repeat ? focusFirst : focusLast)();
  }

  scrollToFocus(undefined, skip);
  return false;
}

function duplicateFocusedTab() {
  let attr = entryWithFocus().attr('id');
  if (attr) {
    chrome.tabs.duplicate(parseInt(attr), (tab) => {
      closeWindow();
      bg('switchTabsWithoutDelay', tab.id);
    });
  }
}

/**
 * This function takes 2 arrays of tabs and returns a new array that contains all of the valid tabs in the recordedTabsList with
 * and tabs in the queryTabList appended.
 *
 * @param recordedTabsList a list of currently know tabs
 * @param queryTabList a tab query result array
 * @returns {Array} an array of tabs in the same order as recordedTabsList with any invalid entries removed and any tabs found in queryTabList
 *    appended to the end
 */
function compareTabArrays(recordedTabsList, queryTabList) {
  var queriedTabsMap = {};
  var tabsToRender = [];

  for (var i = 0; i < queryTabList.length; i++) {
    if (queryTabList[i] && queryTabList[i].id) {
      queriedTabsMap[queryTabList[i].id] = queryTabList[i];
    }
  }

  for (var x = 0; x < recordedTabsList.length; x++) {
    if (!recordedTabsList[x]) {
      continue;
    }
    var id = recordedTabsList[x].id;
    var tab = queriedTabsMap[id];
    if (tab) {
      Utils.extractSuspendedUrl(tab);
      tabsToRender.push(tab);
      delete queriedTabsMap[id];
    } else {
      log("  tab found that is not currently reported as open: ", recordedTabsList[x]);
      delete queriedTabsMap[id];
    }
  }

  for (var extraTab in queriedTabsMap) {
    if (queriedTabsMap.hasOwnProperty(extraTab)) {
      log('  adding missing tab', queriedTabsMap[extraTab]);
      tabsToRender.push(queriedTabsMap[extraTab]);
    }
  }

  return tabsToRender;
}

/**
 * =============================================================================================================================================================
 * Page initialization, rendering and event hookups
 * =============================================================================================================================================================
 */

$(document).ready(async function() {
  pageTimer.log("Document ready");

  // Vivaldi bug workaround (popup is not focused without that)
  window.location.hash = "popup";

  if (Config.get(QUICK_SWITCH_DELAY) > 0) {
    quickSwitchInit();
  }

  switch (searchType()) {
    case 'fuseT1':
    case 'fuseT2':
      search = new FuseSearch();
      break;
    case 'regex':
      search = new RegExSearch();
      break;
    case 'substring':
      search = new StringContainsSearch();
      break;
    case 'fuzzy':
    default:
      // make sure he have something...
      search = new FuzzySearch();
      break;
  }

  $(`<link rel="stylesheet" href="styles/${Config.get(POPUP_STYLE)}" type="text/css" media="all"/>`).appendTo('head');
  $('<style/>').text(Config.get(CUSTOM_CSS)).appendTo('head');

  [bgBookmarks] = await Promise.all([
    bg('getBookmarks'),
    loadTabs(),
    loadClosedTabs(),
  ]);

  // DEBUG: wait 600 ms to simulate slow loading for testing
  // await (() => new Promise(res => setTimeout(res, 600)))();

  $(document).on('keydown.down', focusNext);
  $(document).on('keydown.up', focusPrev);
  $(document).on('keydown.tab', focusNext);
  $(document).on('keydown.shift_tab', focusPrev);

  const skipSize = parseInt(Config.get(PAGEUP_PAGEDOWN_SKIP_SIZE), 10);
  $(document).on('keydown.home', focusFirst);
  $(document).on('keydown.end', focusLast);
  $(document).on('keydown.pagedown', ev => focusNext(ev, skipSize));
  $(document).on('keydown.pageup',   ev => focusPrev(ev, skipSize));

  // handler for opening new tab with the search string
  $(document).on('keydown.' + Config.getKeyCombo(NEW_TAB_POPUP).pattern(), function() {
    openTabForSearch($("#searchbox").val());
    return false;
  });

  // handler for opening the selected item or performing a search
  $(document).on('keydown.return', function() {
    if (!isFocusSet()) {
      focusFirst();
    }

    if (isFocusSet()) {
      entryWithFocus().trigger("click");
    } else {
      openTabForSearch($("#searchbox").val());
    }

    return false;
  });

  // handler for closing a tab or removing a bookmark/history/recent
  $(document).on('keydown.' + (Config.getKeyCombo(CLOSE_TAB_POPUP).pattern() || "NONE"), function() {
    const close = entryWithFocus().find('.close, .remove');
    if (close.length !== 0) {
      if (entryWithFocus().next(".item:not(.closing)").length > 0) {
        focusNext();
      } else if (entryWithFocus().prev(".item:not(.closing)").length > 0) {
        focusPrev();
      } else {
        focusNone();
      }
      close.trigger("click");
    }
    return false;
  });

  $(document).on('keydown.esc', function() {
    if (Config.get(ESC_TO_CLEAR_SEARCHBOX) && $('#searchbox').val()) {
      $('#searchbox').val('');
      return false;
    }
    return closeWindow();
  });

  // handlers for navigation up and down
  $(document).on('keydown.' + (Config.getKeyCombo(FOCUS_NEXT).pattern() || "NONE"), focusNext);
  $(document).on('keydown.' + (Config.getKeyCombo(FOCUS_PREV).pattern() || "NONE"), focusPrev);
  $(document).on('keydown.ctrl_down keydown.alt_down keydown.meta_down', focusNext);
  $(document).on('keydown.ctrl_up keydown.alt_up keydown.meta_up', focusPrev);
  $(document).on('keydown.ctrl_tab keydown.alt_tab keydown.meta_tab', focusNext);
  $(document).on('keydown.ctrl_shift_tab keydown.alt_shift_tab keydown.meta_shift_tab', focusPrev);

  $('#searchbox').focus();
  $('#searchbox').on({
    'blur': function() {
      quickSwitchToggle(false);
    },
    'keyup': function() {
      let str = $("#searchbox").val();
      debouncedSearch(str, function(results) {
        renderTabs(results);
        // store the current search string
        Config.set(LAST_SEARCHED_STR, str);
      })
    }
  });

  /**
   * Try to fetch the last search string.
   * If present, use it to render only matched tabs list
   * else, render all current tabs list
   */
  var lastSearch = Config.get(LAST_SEARCHED_STR);
  if (Config.get(RESTORE_LAST_SEARCHED_STR) && typeof lastSearch !== "undefined" && lastSearch.length > 0) {
    $("#searchbox").val(lastSearch).select();
    performQuery(lastSearch, function(results) {
      renderTabs(results, Config.get(RENDER_DELAY), !Config.get(SHOW_ACTIVE_TAB));
    });
  } else {
    drawCurrentTabs();
  }
  // pageTimer.log("Document ready completed");
});

/**
 * Quick Switch mode: switch to the selected tab when a modifier key is released
 */
let quickSwitchOn = false;
let quickSwitchTimer;

function quickSwitchInit() {
  if (!Config.get(QUICK_SWITCH_DELAY)) return;
  quickSwitchTimer = setTimeout(quickSwitchToggle, Config.get(QUICK_SWITCH_DELAY), true);

  $(document).on('keyup.ctrl keyup.alt keyup.meta', function(ev) {
    if (quickSwitchOn) {
      entryWithFocus().trigger("click");
    }
    quickSwitchToggle(false);
  });

  $(document).on('keydown', function(ev) {
    if (ev.key === 'Control' || ev.key === 'Alt' || ev.key === 'Meta' ||
      ev.code === "Space" || ev.code === "Delete" || ev.code === "Backspace" || ev.code === "ArrowLeft" || ev.code === "ArrowRight"
    ) {
      // cancel quick switch mode on Space key
      quickSwitchToggle(false);
    }
    log(`Key pressed: ${ev.key}, code: ${ev.code}, quickSwitchOn: ${quickSwitchOn}`);
  });
}

function quickSwitchToggle(on) {
  log("Quick Switch toggle: ", !!on);
  quickSwitchOn = !!on;
  document.querySelector('body').classList.toggle('quick-switch', quickSwitchOn);
  const sBox = document.getElementById("searchbox");
  sBox._placeholder ||= sBox.placeholder;
  sBox.placeholder = quickSwitchOn ? 'Release key to switch tab. Space to cancel.' : sBox._placeholder;
  if (!quickSwitchOn) {
    clearTimeout(quickSwitchTimer);
  }
}

/**
 * curry up a debounced version of performQuery()
 */
const debouncedSearch = Utils.debounce(performQuery, debounceDelay);

/**
 * open a new tab with `searchString`, if it looks like a valid URL open that
 * otherwise pass it as an encoded search string to a search engine.
 *
 * @param searchString
 */
function openTabForSearch(searchString) {

  let url = searchStringAsUrl(searchString);

  if (/^(http|https|ftp):\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(:[a-zA-Z0-9]*)?\/?([a-zA-Z0-9\-\._\?,'/\\\+&amp;%$#=~])*$/.exec(url)) {
    log("no tab selected, search string looks like a url, opening in new tab", searchString, url);
    chrome.tabs.create({url: url});
  } else {
    log("no tab selected, passing search string to search engine", searchString, url);
    //url = "http://www.google.com/search?q=" + encodeURI($("input[type=text]").val());
    let searchUrl = Config.get(SEARCH_STRING).replace(/%s/g, encodeURI(searchString));
    chrome.tabs.create({url: searchUrl});
  }
}

function drawCurrentTabs() {
  /**
   * This seems kinda nasty but it ensures that we are rendering the latest title information for the tabs
   * since this can be updated after pages have loaded
   */
  chrome.tabs.query({}, function(queryResultTabs) {

    // assign the cleaned tabs list back to background.js
    bgTabs = compareTabArrays(bgTabs, queryResultTabs);

    // find the current tab so that it can be excluded on the initial tab list rendering
    chrome.tabs.query({currentWindow: true, active: true}, function(tab) {
      var tabs = bgTabs;

      if (Config.get(ORDER_TABS_IN_WINDOW_ORDER)) {
        tabs = tabs.slice().sort(function(a, b) {
          // we want to list the current window's tabs first
          // if either compared tab is part of the current window, order it first
          if(a.windowId === tab[0].windowId && b.windowId !== tab[0].windowId) return -1;
          if(a.windowId !== tab[0].windowId && b.windowId === tab[0].windowId) return 1;
          // when ordering tabs from the current window, use the tab index to sort
          if(a.windowId === tab[0].windowId && b.windowId === tab[0].windowId) return a.index - b.index;
          // at this point, neither a nor b are part of the current window
          // order either on windowId if both tabs are in different windows, or
          // on the tab's index if they're part of the same (non-current) window
          return (a.windowId !== b.windowId)? (a.windowId - b.windowId) : (a.index - b.index);
        });
      }

      if (Config.get(ORDER_TABS_BY_URL)) {
        tabs = tabs.slice().sort(function (a, b) {
          if (a.url < b.url) {
            return -1
          } else if (a.url === b.url) {
            return 0
          } else {
            return 1
          }
        });
      }

      /**
       * render only the tabs and closed tabs on initial load (hence the empty array [] for bookmarks), the
       * delay is important to work around issues with Chromes extension rendering on the Mac, refs #91, #168
       */
      renderTabs(
        {
          allTabs: tabs,
          closedTabs: bgClosedTabs
        },
        Config.get(RENDER_DELAY),
        !Config.get(SHOW_ACTIVE_TAB)
      );
    });
  });
}

/**
 * sort out the tabs and execute the popup template rendering.
 *
 * @param params an object that contains the various tab lists to be rendered
 * @param delay (optional) - how long before we render the tab list to the popup html
 * @param skipCurrentTab (optional) - exclude current tab from the render list
 */
async function renderTabs(params, delay, skipCurrentTab) {
  if (params === null) {
    return;
  }

  pageTimer.log("start rendering tab template");

  let currentTab;
  if (skipCurrentTab) {
    [currentTab] = await chrome.tabs.query({ currentWindow: true, active: true });
  }

  const wins = [];
  var allTabs = (params.allTabs || []).reduce(function(result, obj) {
    if (currentTab && obj.id === currentTab.id) {
      log(obj.id, currentTab.id, obj.id !== currentTab.id, obj, currentTab);
    }
    if (!currentTab || obj.id !== currentTab.id) {
      obj.templateTabImage = tabImage(obj);
      obj.templateTitle = encodeHTMLSource(obj.title);
      obj.templateTooltip = stripTitle(obj.title);
      obj.templateUrl = encodeHTMLSource(obj.displayUrl || obj.url);
      obj.templateUrlPath = encodeHTMLSource(obj.url);
      let index = wins.indexOf(obj.windowId);
      if(index == -1){
        index = wins.length;
        wins.push(obj.windowId)
      }
      obj.winInfo = 'window-' + index;
      result.push(obj);
    }
    return result;
  }, []);

  // TODO: could be new option "always sort in recently used order"
  // Utils.restoreTabsOrder(allTabs);

  var closedTabs = (params.closedTabs || []).map(function(obj) {
    obj.templateTabImage = tabImage(obj);
    obj.templateTitle = encodeHTMLSource(obj.title);
    obj.templateTooltip = stripTitle(obj.title);
    obj.templateUrl = encodeHTMLSource(obj.displayUrl || obj.url);
    obj.templateUrlPath = encodeHTMLSource(obj.url);
    return obj;
  });

  let toSearchableObj = function(obj) {
    obj.templateTabImage = faviconUrl(obj.cleanUrl);
    obj.templateTitle = encodeHTMLSource(obj.title);
    obj.templateTooltip = stripTitle(obj.title);
    obj.templateUrlPath = encodeHTMLSource(obj.fullUrl);
    obj.templateUrl = encodeHTMLSource(obj.displayUrl);
    obj.templateId = encodeHTMLSource(obj.id);
    if (obj.date) {
      obj.templateDate = new Date(obj.date).toISOString().slice(0, 10);
    }
    return obj;
  };

  var bookmarks = (params.bookmarks || []).map(toSearchableObj);
  var history = (params.history || []).map(toSearchableObj);

  var actions = (params.actions || []).map(function(obj, index) {
    obj.id = index;
    return obj
  });

  var context = {
    'help': params.help,
    'type': params.type || "all",
    'actions': actions,
    'tabs': allTabs,
    'closedTabs': closedTabs,
    'bookmarks': bookmarks,
    'history': history,
    'closeTitle': "close tab (" + Config.getKeyCombo(CLOSE_TAB_POPUP).pattern() + ")",
    'tabImageStyle': Config.get(SHOW_FAVICONS) ? "tabimage" : "tabimage hideicon",
    'urlStyle': Config.get(SHOW_URLS) ? "" : "nourl",
    'urls': Config.get(SHOW_URLS),
    'tips': Config.get(SHOW_TOOLTIPS),
    'noResults': !params.help && allTabs.length === 0 && closedTabs.length === 0 && bookmarks.length === 0 && history.length === 0,
    'hasClosedTabs': closedTabs.length > 0,
    'hasBookmarks': bookmarks.length > 0,
    'hasHistory': history.length > 0,
    'hasActions': actions.length > 0
  };

  /**
   * render the templates, the timeout is required to work around issues with Chromes extension rendering on the Mac, refs #91, #168
   */
  setTimeout(function() {
    document.getElementById("content-list").innerHTML = Mustache.to_html(
        document.getElementById('template').text, context
    );
    document.querySelector(".content").style.opacity = "1";

    focusFirst(true);
    // if search box is empty then focus on the previously viewed tab
    if ($("#searchbox").val().length === 0 && Config.get(SHOW_ACTIVE_TAB)) {
      focusNext();
    }

    // create a new tab for the window
    let fOpenNewTab = function(e) {
      e.stopPropagation();

      if (this.dataset.sessionId) {
        restoreSession(this.dataset.sessionId);
      } else {
        openInNewTab(this.dataset.path);
      }
    };

    $('.closed').on('click', fOpenNewTab);
    $('.bookmark').on('click', fOpenNewTab);
    $('.history').on('click', fOpenNewTab);

    $('.open').on('click', function(e) {
      e.stopPropagation();
      closeWindow();
      bg('switchTabsWithoutDelay', parseInt(this.id));
    });

    $('.item:is(.tab, .bookmark, .history)').on('mousedown', function(e) {
      if (e.button === 1) {
        e.preventDefault();
        $(this).find('.close, .remove').trigger('click');
      }
    });

    // process close/remove button click
    $('.close, .remove').on('click', async function (e) {
      e.stopPropagation();

      if (this.dataset.tabId) {
        // close a tab
        await closeTabs([parseInt(this.dataset.tabId)]);
        loadTabs();
        loadClosedTabs();
        return;

      } else if (this.dataset.sessionId) {
        // remove a recently closed item, also deletes its history entry
        const closedTab = closedTabs.find(tab => tab.sessionId === this.dataset.sessionId) || {};
        await chrome.history.deleteUrl({ url: closedTab.fullUrl || closedTab.url });
        setTimeout(loadClosedTabs, 10); // need a delay to make sure Chrome updated recently closed tabs list

      } else if (this.dataset.bookmarkId) {
        // delete a bookmark
        chrome.bookmarks.remove(this.dataset.bookmarkId);
        const bm = bgBookmarks.find(b => b.id === this.dataset.bookmarkId) || {};
        bm.url = bm.title = '';

      } else {
        // delete a history item, also removes a recently closed tab with the same URL
        let histItem = this.closest('.item.history');
        if (histItem) {
          const hist = historyCache.find(item => (item.fullUrl || item.url) === histItem.dataset.path) || {};
          await chrome.history.deleteUrl({ url: hist.fullUrl || hist.url });
          hist.url = hist.title = '';
          setTimeout(loadClosedTabs, 10);
        }
      }

      $(this).closest('.item').addClass('closing').fadeOut("fast", function () { this.remove() });
    });

    /**
     * Since it's unlikely that a user will want to repeat an action we will
     * trigger it and clear the last search string before closing the popup.
     */
    $('.action').on('click', function() {
      actions[parseInt(this.getAttribute('data-action'))].exec();
      Config.set(LAST_SEARCHED_STR, "");
      closeWindow();
    });

    document.querySelectorAll("img").forEach(img => img.addEventListener("error", imageError));

    pageTimer.log("tab template rendered");
  }, delay || 0);
}

function imageError(ev) {
  ev.target.src = "/assets/blank.png";
}

/**
 * listen to the background page for key presses and trigger the appropriate responses
 */
bgMessagePort.onMessage.addListener(function(msg) {
  // log("popup message!", msg);
  if (msg.cmd === "next") {
    focusPrev();
  } else if (msg.cmd === "prev") {
    focusNext();
  } else if (msg.cmd === "duplicate") {
    duplicateFocusedTab();
  }
});

/**
 * =============================================================================================================================================================
 * Search related functionality
 * =============================================================================================================================================================
 */

function searchStringAsUrl(url) {

  if (!/^(https?|chrome):\/\/.*/.exec(url)) {
    url = "http://" + url;
  }

  return url;
}

/**
 * =============================================================================================================================================================
 * support functions etc
 * =============================================================================================================================================================
 */

function startsWith(str, start) {
  return str.lastIndexOf(start, 0) === 0;
}

function endsWith(str, end) {
  return str.indexOf(end, str.length - end.length) !== -1;
}

function startsOrEndsWith(str, checkStr) {
  return startsWith(str, checkStr) || endsWith(str, checkStr)
}


/**
 *
 * Modified to 'encode' instances of {} to <b></b> to allow string match highlighting while still escaping HTML.
 *
 */
function encodeHTMLSource(str) {
  var encodeHTMLRules = {"&": "&#38;", "<": "&#60;", ">": "&#62;", '"': '&#34;', "'": '&#39;', "/": '&#47;', "\v": '<b>', "\b": '</b>'},
      matchHTML = /&(?!#?\w+;)|<|>|"|'|\/|[\v]|[\b]/g;
  return str ? str.replace(matchHTML, function(m) {
    return encodeHTMLRules[m] || m;
  }) : str;
}

/**
 *
 *  Strips HTML tags and pre/post marks from given text. Used to remove these from tooltip text.
 *
 */
function stripTitle(str) {
  str = $('<div/>').html(str).text();
  str = str.replace(/(?:[\v]|[\b])/g, '');
  return str;
}

function tabImage(tab) {
  if (tab.audible) {
    return "/assets/noisy.png"
  } else if (tab.favIconUrl) {
    return tab.favIconUrl;
  } else {
    return faviconUrl(tab.cleanUrl);
  }
}

function faviconUrl(url) {
  if (Utils.IS_FIREFOX) {
    if (url?.startsWith("http")) {
      const hostname = new URL(url).hostname;
      // return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    } else {
      return "/assets/blank.png";
    }
  }
  return `chrome-extension://${chrome.runtime.id}/_favicon/?size=32&pageUrl=${encodeURIComponent(url)}`;
}

/**
 * read a parameter from the page url, used to determine if the window was launched as a popup or loaded into a tab
 * (see https://stackoverflow.com/a/29998214)
 *
 * @param sParam
 * @returns {string}
 */
function getUrlParameter(sParam) {
  var sPageURL = window.location.search.substring(1);
  var sURLVariables = sPageURL.split('&');
  for (var i = 0; i < sURLVariables.length; i++) {
    var sParameterName = sURLVariables[i].split('=');
    if (sParameterName[0] === sParam) {
      return sParameterName[1];
    }
  }
}

/**
 * =============================================================================================================================================================
 * Query
 * =============================================================================================================================================================
 */

/**
 *
 * @param q the query string, this could contain a command string (starting with '/')
 * @param onComplete callback function used to return the search result:
 *  {{actions: *[], bookmarks: *[], closedTabs: [], allTabs: []}|null}
 */
function performQuery(q, onComplete, force) {

  if (!AbstractSearch.prototype.shouldSearch(q) && !force) {
    return null;
  }

  // split the query into a command and query string if possible
  let arr = q.match(/(^\/\w+)? *(.*)?/);
  let cmdStr = arr[1] || "";
  let query = arr[2] || "";

  log(arr[0] + " cmd: '" + cmdStr + "' q: '" + query + "'");

  // lookup the command
  let cmd = commands[cmdStr];

  if (cmd) {
    log("executing cmd", cmd);
    cmd.run(query, onComplete);
  } else {
    // no command detected, run the base search with the original query string
    onComplete(search.executeSearch(q, false, false))
  }
}

/**
 * =============================================================================================================================================================
 * Abstract Search
 * =============================================================================================================================================================
 */

function AbstractSearch() {
}

/**
 * If the search string hasn't changed, the keypress wasn't a character
 * but some form of navigation, so we can stop.
 *
 * @returns {boolean}
 */
AbstractSearch.prototype.shouldSearch = function(query) {
  // make sure the this.searchStr variable has been initialized
  if (!this.searchStr) {
    this.searchStr = "";
  }
  var newQuery = this.searchStr !== query;
  this.searchStr = query;
  return newQuery;
};

/**
 * Retrieve the search string from the search box and search the different tab groups following these rules:
 *
 * - if the search string starts/ends with 3 spaces ('   ') search the entire browser history
 * - if the search string starts/ends with 2 spaces ('  ') only search bookmarks
 * - if the search string starts/ends with 1 space (' ') search tabs and bookmarks
 * - otherwise search tabs unless there are less than 5 results in which case include bookmarks
 *
 */
AbstractSearch.prototype.executeSearch = function(query, searchBookmark, searchHistory) {
  const searchHistoryStr = "   ";
  const searchBookmarkStr = "  ";
  const searchTabsBookmarksStr = " ";
  const audibleQuery = ["<))", "!"];
  const searchClosed = "-";
  const showHelp = "/";

  pageTimer.reset();

  // Filter!
  var filteredTabs = [];
  var filteredClosed = [];
  var filteredBookmarks = [];

  if (query.trim().length === 0) {
    // no need to search if the string is empty
    filteredTabs = bgTabs.filter(Utils.validTab);
    filteredClosed = bgClosedTabs;

  } else if (audibleQuery.includes(query)) {
    filteredTabs = bgTabs.filter(tab => Utils.validTab(tab) && filterAudible(tab))

  } else if (query === showHelp) {
    return { help: true };

  } else if (startsOrEndsWith(query, searchClosed)) {
    query.trim().length === 1
      ? filteredClosed = bgClosedTabs
      : filteredClosed = this.searchTabArray(query.replace(/(^-)|(-$)/g, '').trim(), bgClosedTabs);

  } else if (searchHistory || startsOrEndsWith(query, searchHistoryStr)) {
    // i hate to break out of a function part way though but...
    this.searchHistory(query, 0);
    return null;

  } else if (searchBookmark || startsOrEndsWith(query, searchBookmarkStr)) {
    filteredBookmarks = this.searchTabArray(query, bgBookmarks);

  } else {
    filteredTabs = this.searchTabArray(query, bgTabs.filter(Utils.validTab));
    filteredClosed = this.searchTabArray(query, bgClosedTabs);
    var resultCount = filteredTabs.length + filteredClosed.length;
    if (startsOrEndsWith(query, searchTabsBookmarksStr) || resultCount < MIN_TAB_ONLY_RESULTS) {
      filteredBookmarks = this.searchTabArray(query, bgBookmarks);
    }

    // Utils.restoreTabsOrder(filteredTabs);
  }

  pageTimer.log("search completed for '" + query + "'");

  // only show the top MAX_NON_TAB_RESULTS bookmark hits.
  return {
    allTabs: filteredTabs,
    closedTabs: filteredClosed,
    bookmarks: filteredBookmarks.slice(0, MAX_NON_TAB_RESULTS)
  };
};

function filterAudible(t) {
  return t.audible
}

/**
 * Load all of the browser history and search it for the best matches
 *
 * @param searchStr
 * @param since
 */
AbstractSearch.prototype.searchHistory = async function(searchStr, since) {
  var doSearch = function(h) {
    renderTabs({
      history: this.searchTabArray(searchStr, h).slice(0, MAX_NON_TAB_RESULTS)
    });
  }.bind(this);

  /**
   * compile the history filter regexp
   */
  var filterString = Config.get(HISTORY_FILTER).trim();
  var filterRegEx = filterString.length > 0 ? new RegExp(filterString) : null;

  /**
   * test each url against a regular expression to see if it should be included in the history search
   * https?:\/\/www\.(google|bing)\.(ca|com|co\.uk)\/(search|images)
   */
  var includeUrl = function(url) {
    return !filterRegEx || !filterRegEx.exec(url);
  };

  if (historyCache !== null) {
    // use the cached values
    doSearch(historyCache);
  } else {
    // load browser history
    const result = await chrome.history.search({ text: "", maxResults: 1_000_000_000, startTime: since });
    var includeView = function(v) {
      return v.url && v.title && includeUrl(v.url)
    };

    historyCache = result.filter(includeView);
    historyCache.forEach(Utils.extractSuspendedUrl);
    historyCache.forEach(function(h) {
      h.date = h.lastVisitTime;
      h.title = new Date(h.date).toISOString().slice(0, 10) + ' | ' + h.title;
    });

    log("loaded history for search", historyCache.length, " (unfiltered: ", result.length, ")");

    doSearch(historyCache);
  }
};

/**
 * inserts '\v' and 'b' markers at start and end of search matches
 */
AbstractSearch.prototype.highlightString = function(string, start, end) {
  return string.substring(0, start) + '\v' + string.substring(start, end + 1) + '\b' + string.substring(end + 1);
};

/**
 * =============================================================================================================================================================
 * Fuzzy Search ( https://github.com/myork/fuzzy )
 * =============================================================================================================================================================
 */

function FuzzySearch() {
}

FuzzySearch.prototype = Object.create(AbstractSearch.prototype);

FuzzySearch.prototype.searchTabArray = function(query, tabs) {
  var searchUrls = Config.get(SHOW_URLS) || Config.get(SEARCH_URLS);
  var options = {
    pre: '\v',
    post: '\b',
    extract: function(element) {
      if (searchUrls) {
        return element.title + "~~" + element.url;
      } else {
        return element.title;
      }
    }
  };

  return fuzzy.filter(query.trim(), tabs, options).map(function(entry) {
    var parts = entry.string.split(/~~/);
    // return a copy of the important fields for template rendering
    return {
      ...entry.original,
      title: parts[0],
      displayUrl: parts[1],
    }
  });
};

/**
 * =============================================================================================================================================================
 * Fuse Search ( http://fusejs.io/ )
 * =============================================================================================================================================================
 */

function FuseSearch() {
}

FuseSearch.prototype = Object.create(AbstractSearch.prototype);

// highlights Fuse results with the matches
FuseSearch.prototype.highlightResult = function(result) {
  var item = result.item;
  var highlighted = {};
  result.matches.forEach(function(match) {
    var formatted = item[match.key];

    // highlight each of the matches
    match.indices.forEach(function(endpoints, i) {
      // each previous match has added two characters
      var offset = i * 2;
      formatted = this.highlightString(formatted, endpoints[0] + offset, endpoints[1] + offset);
    }.bind(this));

    highlighted[match.key] = formatted;
  }.bind(this));
  return highlighted;
};

FuseSearch.prototype.searchTabArray = function(query, tabs) {
  var options = {
    useTokenSearch: true,
    tokenMatch: 'all',
    ignoreLocation: true,
    ignoreDiacritics: true,
    shouldSort: true,
    includeMatches: true,
    useExtendedSearch: true,
    findAllMatches: true,
    threshold: 0.4,
    keys: [{
      name: 'title',
      weight: 1.0
    }]
  };

  if (Config.get(SHOW_URLS) || Config.get(SEARCH_URLS)) {
    options.keys.push({
      name: 'url',
      weight: 0.9
    });
  }

  var fuse = new Fuse(tabs, options);

  return fuse.search(query.trim()).map(function(result) {
    var highlighted = this.highlightResult(result);
    return {
      ...result.item,
      title: highlighted.title || result.item.title,
      displayUrl: highlighted.url || result.item.url,
    }
  }.bind(this));
};

/**
 * =============================================================================================================================================================
 * RegEx Search
 * =============================================================================================================================================================
 */

function RegExSearch() {
}

RegExSearch.prototype = Object.create(AbstractSearch.prototype);

/**
 * returns the result with the match highlighted
 */
RegExSearch.prototype.highlightSearch = function(result) {
  if (result) {
    return this.highlightString(result.input, result.index, result.index + result[0].length - 1);
  }
};

RegExSearch.prototype.searchTabArray = function(query, tabs) {
  var that = this;
  var search = new RegExp(query.trim(), 'i');
  return tabs.map(function(tab) {
    var highlightedTitle = that.highlightSearch(search.exec(tab.title));
    var highlightedUrl = (Config.get(SHOW_URLS) || Config.get(SEARCH_URLS)) && that.highlightSearch(search.exec(tab.url));
    if (highlightedTitle || highlightedUrl) {
      return {
        ...tab,
        title: highlightedTitle || tab.title,
        displayUrl: highlightedUrl || tab.url,
      }
    }
  }).filter(function(result) {
    return result;
  })
};

/**
 * =============================================================================================================================================================
 * StringContains Search
 * =============================================================================================================================================================
 */

function StringContainsSearch() {
}

StringContainsSearch.prototype = Object.create(AbstractSearch.prototype);

/**
 * returns the result with the match highlighted
 */
StringContainsSearch.prototype.highlightSearch = function(str, query) {
  if (str) {
    var i = str.toLowerCase().indexOf(query);
    if (i >= 0) {
      return this.highlightString(str, i, i + query.length - 1);
    }
  }
};

StringContainsSearch.prototype.searchTabArray = function(query, tabs) {
  let q = query.trim().toLowerCase();
  return tabs.map(function(tab) {
    let highlightedTitle = this.highlightSearch(tab.title, q);
    let highlightedUrl = (Config.get(SHOW_URLS) || Config.get(SEARCH_URLS)) && this.highlightSearch(tab.url, q);
    if (highlightedTitle || highlightedUrl) {
      return {
        ...tab,
        title: highlightedTitle || tab.title,
        displayUrl: highlightedUrl || tab.url,
      }
    }
  }.bind(this)).filter(function(result) {
    return result;
  })
};


/**
 * =============================================================================================================================================================
 * Commands
 * =============================================================================================================================================================
 */

/**
 * Commands can:
 * - change the search algorithm being used
 * - set flags for bookmark and history searches
 * - adjust the search results before returning them
 * - perform an action using the tabs currently returned by the search as input
 */
function AbstractCommand() {
}

AbstractCommand.prototype.run = function(q, onComplete) {
  onComplete(search.executeSearch(q, false, false));
};

AbstractCommand.prototype.tabStr = function(count) {
  if (count === 1) {
    return count + " Tab";
  } else {
    return count + " Tabs";
  }
};

/**
 * switch the search algorithm before running the query, reset it to the original search on completion.
 *
 * @param tempSearch
 * @param query
 * @returns {{}}
 */
AbstractCommand.prototype.searchUsing = function(tempSearch, query) {
  let defSearch = search;
  let results = {};
  try {
    search = tempSearch;
    results = search.executeSearch(query, false, false);
  } finally {
    search = defSearch;
  }
  return results
};

AbstractCommand.prototype.buildResult = function(tabs, actions) {
  return {
    allTabs: tabs,
    closedTabs: [],
    bookmarks: [],
    history: [],
    actions: actions,
  }
};

/**
 * Bookmark search
 * =============================================================================================================================================================
 */

function BookmarkSearchCmd() {
}

BookmarkSearchCmd.prototype = Object.create(AbstractCommand.prototype);

BookmarkSearchCmd.prototype.run = function(q, onComplete) {
  onComplete(search.executeSearch(q, true, false));
};


/**
 * History search
 * =============================================================================================================================================================
 */

function HistorySearchCmd() {
}

HistorySearchCmd.prototype = Object.create(AbstractCommand.prototype);

HistorySearchCmd.prototype.run = function(query, onComplete) {
  onComplete(search.executeSearch(query, false, true));
};


/**
 * Current window only search
 * =============================================================================================================================================================
 */

function WindowSearchCmd() {
}

WindowSearchCmd.prototype = Object.create(AbstractCommand.prototype);

WindowSearchCmd.prototype.run = function(query, onComplete) {
  let searchResults = search.executeSearch(query, false, false) || {};
  let tabs = searchResults.allTabs || bgTabs;

  chrome.windows.getCurrent(function(currentWindow) {

    searchResults.allTabs = tabs.filter(function(t) {
      return t.windowId === currentWindow.id;
    });

    // return the search result
    onComplete(searchResults);
  });
};




/**
 * Current group only search
 * =============================================================================================================================================================
 */

function GroupSearchCmd() {
}

GroupSearchCmd.prototype = Object.create(AbstractCommand.prototype);

GroupSearchCmd.prototype.run = function (query, onComplete) {
  let searchResults = search.executeSearch(query, false, false) || {};
  let tabs = searchResults.allTabs || bgTabs;

  chrome.tabs.query({active: true, currentWindow: true}, function (currentTabArray) {
    if (currentTabArray.length > 0) {
      let gid = currentTabArray[0].groupId;
      searchResults.allTabs = tabs.filter(function (t) {
        return t.groupId === gid;
      });
    }

    // return the search result
    onComplete(searchResults);
  });
};


/**
 * Current pinned tabs only search
 * =============================================================================================================================================================
 */

function PinnedTabSearchCmd() {
}

PinnedTabSearchCmd.prototype = Object.create(AbstractCommand.prototype);

PinnedTabSearchCmd.prototype.run = function(query, onComplete) {
  let searchResults = search.executeSearch(query, false, false) || {};
  let tabs = searchResults.allTabs || bgTabs;

  searchResults.allTabs = tabs.filter(function(t) {
    return t.pinned;
  });

  // return the search result
  onComplete(searchResults);
};


/**
 * Fuzzy search
 * =============================================================================================================================================================
 */

function FuzzySearchCmd() {
}

FuzzySearchCmd.prototype = Object.create(AbstractCommand.prototype);

FuzzySearchCmd.prototype.run = function(query, onComplete) {
  onComplete(this.searchUsing(new FuzzySearch(), query));
};


/**
 * Fuse search
 * =============================================================================================================================================================
 */

function FuseSearchCmd() {
}

FuseSearchCmd.prototype = Object.create(AbstractCommand.prototype);

FuseSearchCmd.prototype.run = function(query, onComplete) {
  onComplete(this.searchUsing(new FuseSearch(), query));
};


/**
 * Regular expression search
 * =============================================================================================================================================================
 */

function RegExpSearchCmd() {
}

RegExpSearchCmd.prototype = Object.create(AbstractCommand.prototype);

RegExpSearchCmd.prototype.run = function(query, onComplete) {
  onComplete(this.searchUsing(new RegExSearch(), query));
};


/**
 * Sub string search
 * =============================================================================================================================================================
 */

function SubStrSearchCmd() {
}

SubStrSearchCmd.prototype = Object.create(AbstractCommand.prototype);

SubStrSearchCmd.prototype.run = function(query, onComplete) {
  onComplete(this.searchUsing(new StringContainsSearch(), query));
};


/**
 * Close tabs
 * =============================================================================================================================================================
 */

function CloseTabsCmd() {
}

CloseTabsCmd.prototype = Object.create(AbstractCommand.prototype);

CloseTabsCmd.prototype.run = function(query, onComplete) {
  let searchResults = this.searchUsing(new RegExSearch(), query) || {};
  let tabs = searchResults.allTabs || [];

  let filtered = tabs.filter(function(t) {
    return !t.pinned;
  });

  onComplete(
      this.buildResult(filtered,
          [{
            name: "Close " + this.tabStr(filtered.length),
            description: "Close all the tabs displayed in the search results",
            exec: function() {
              let tabIds = filtered.map(function(t) {
                return t.id
              });
              closeTabs(tabIds);
            }
          }])
  );
};


/**
 * Merge tabs
 * =============================================================================================================================================================
 */

function MergeTabsCmd() {
}

MergeTabsCmd.prototype = Object.create(AbstractCommand.prototype);

MergeTabsCmd.prototype.run = function(query, onComplete) {
  let searchResults = this.searchUsing(new RegExSearch(), query) || {};
  let tabs = searchResults.allTabs || bgTabs;
  let tabStr = this.tabStr;

  chrome.windows.getCurrent(function(currentWindow) {

    let filtered = tabs.filter(function(t) {
      return t.windowId !== currentWindow.id;
    });

    searchResults.allTabs = filtered;
    searchResults.closedTabs = [];
    searchResults.bookmarks = [];
    searchResults.history = [];

    searchResults.actions = [{
      name: "Merge " + tabStr(filtered.length),
      description: "Merge all the displayed tabs into this window",
      exec: function() {
        let tabIds = filtered.map(function(t) {
          return t.id
        });
        chrome.tabs.move(tabIds, {
          windowId: currentWindow.id,
          index: -1
        });
      }
    }, {
      name: "Merge All Tabs",
      description: "Add ALL tabs into this window",
      exec: function() {
        chrome.windows.getAll({populate: true}, function(windows) {
          for (let otherWindow of windows) {
            if (otherWindow.id !== currentWindow.id) {
              let tabIds = otherWindow.tabs.map(function(t) {
                return t.id;
              });
              chrome.tabs.move(tabIds, {
                windowId: currentWindow.id,
                index: -1
              });
            }
          }
        });
      }
    }];

    // return the search result
    onComplete(searchResults);
  });
};


/**
 * Split tabs
 * =============================================================================================================================================================
 */

function SplitTabsCmd() {
}

SplitTabsCmd.prototype = Object.create(AbstractCommand.prototype);

SplitTabsCmd.prototype.run = function(query, onComplete) {
  let searchResults = this.searchUsing(new RegExSearch(), query) || {};
  let tabs = searchResults.allTabs || bgTabs;
  let tabStr = this.tabStr;

  chrome.tabs.query({currentWindow: true, active: true}, function(tab) {
    let currentTab = tab[0];
    chrome.windows.getCurrent({populate: true}, function(currentWindow) {

      let filtered = tabs.filter(function(t) {
        return t.windowId === currentWindow.id;
      });

      searchResults.allTabs = filtered;
      searchResults.closedTabs = [];
      searchResults.bookmarks = [];
      searchResults.history = [];
      searchResults.actions = [{
        name: "Split " + tabStr(filtered.length),
        description: "Split all the displayed tabs into a new window",
        exec: function() {
          let tabIds = filtered.map(function(t) {
            return t.id
          });
          if (tabIds.length > 0) {
            bg('splitTabs', tabIds);
          }
        }
      }, {
        name: "Split Window Tabs at Current Tab",
        description: "Move tabs from this window at the current tab into a new window",
        exec: function() {
          let tabIds = currentWindow.tabs.map(function(t) {
            return t.id;
          });
          let ctIndex = tabIds.indexOf(currentTab.id);
          if (ctIndex > -1 && tabIds.length > 0) {
            bg('splitTabs', tabIds.slice(ctIndex));
          }
        }
      }];

      // return the search result
      onComplete(searchResults);
    });
  });
};

/**
 * Reload tabs
 * =============================================================================================================================================================
 */

function ReloadTabsCmd() {
}

ReloadTabsCmd.prototype = Object.create(AbstractCommand.prototype);

ReloadTabsCmd.prototype.run = function(query, onComplete) {
  let searchResults = this.searchUsing(new RegExSearch(), query) || {};
  let tabs = searchResults.allTabs || [];

  searchResults.allTabs = tabs;
  searchResults.closedTabs = [];
  searchResults.bookmarks = [];
  searchResults.history = [];
  searchResults.actions = [{
    name: "Reload " + this.tabStr(tabs.length),
    description: "Reload all the tabs displayed in the search results",
    exec: function() {
      tabs.map(function(t) {
        chrome.tabs.reload(t.id, {bypassCache: false});
      });
    }
  }, {
    name: "Reload " + this.tabStr(tabs.length) + ", Skip Cache",
    description: "Reload all the tabs displayed in the search results without using locally cached data",
    exec: function() {
      tabs.map(function(t) {
        chrome.tabs.reload(t.id, {bypassCache: true});
      });
    }
  }, {
    name: "Reload the Current Tab, Skip Cache",
    description: "Reload the current tab without using locally cached data",
    exec: function() {
      chrome.tabs.reload({bypassCache: true});
    }
  }];
  onComplete(searchResults);
};


/**
 * Mute tabs
 * =============================================================================================================================================================
 */

function MuteTabsCmd() {
}

MuteTabsCmd.prototype = Object.create(AbstractCommand.prototype);

MuteTabsCmd.prototype.run = function(query, onComplete) {
  let searchResults = this.searchUsing(new RegExSearch(), query) || {};
  let tabs = searchResults.allTabs || [];

  searchResults.allTabs = tabs;
  searchResults.closedTabs = [];
  searchResults.bookmarks = [];
  searchResults.history = [];
  searchResults.actions = [{
    name: "Mute " + this.tabStr(tabs.length),
    description: "Mute all the tabs displayed in the search results",
    exec: function() {
      tabs.map(function(t) {
        chrome.tabs.update(t.id, {muted: true});
      });
    }
  }, {
    name: "Mute the Current Tab",
    description: "Mute the current tab",
    exec: function() {
      chrome.tabs.update({muted: true});
    }
  }];
  onComplete(searchResults);
};


/**
 * Unmute tabs
 * =============================================================================================================================================================
 */

function UnmuteTabsCmd() {
}

UnmuteTabsCmd.prototype = Object.create(AbstractCommand.prototype);

UnmuteTabsCmd.prototype.run = function(query, onComplete) {
  let searchResults = this.searchUsing(new RegExSearch(), query) || {};
  let tabs = searchResults.allTabs || [];

  searchResults.allTabs = tabs;
  searchResults.closedTabs = [];
  searchResults.bookmarks = [];
  searchResults.history = [];
  searchResults.actions = [{
    name: "Unmute " + this.tabStr(tabs.length),
    description: "Unmute all the tabs displayed in the search results",
    exec: function() {
      tabs.map(function(t) {
        chrome.tabs.update(t.id, {muted: false});
      });
    }
  }, {
    name: "Unmute the Current Tab",
    description: "Unmute the current tab",
    exec: function() {
      chrome.tabs.update({muted: false});
    }
  }];
  onComplete(searchResults);
};

/**
 * Copy tabs
 * =============================================================================================================================================================
 */

function CopyTabsCmd() {
}

CopyTabsCmd.prototype = Object.create(AbstractCommand.prototype);

CopyTabsCmd.prototype.run = function(query, onComplete) {
  let searchResults = this.searchUsing(new RegExSearch(), query) || {};
  let tabs = searchResults.allTabs || [];

  searchResults.allTabs = tabs;
  searchResults.closedTabs = [];
  searchResults.bookmarks = [];
  searchResults.history = [];
  searchResults.actions = [{
    name: "Copy URLs of " + this.tabStr(tabs.length),
    description: "Copy URLs of all the tabs displayed in the search results",
    exec: function() {
      let urls = tabs.map(function(t) {
        return t.cleanUrl || t.fullUrl || t.url;
      });
      navigator.clipboard.writeText(urls.join("\n"));
    }
  }, {
    name: "Copy the Current Tab's URL",
    description: "Copy the current tab's URL",
    exec: function() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs.length > 0) {
          navigator.clipboard.writeText(tabs[0].url);
        }
      });
    }
  }];
  onComplete(searchResults);
};

/**
 * Open options
 * =============================================================================================================================================================
 */

function OpenOptionsCmd() {
}

OpenOptionsCmd.prototype = Object.create(AbstractCommand.prototype);

OpenOptionsCmd.prototype.run = function(query, onComplete) {
  let searchResults = {};
  let tabs = [];

  searchResults.allTabs = tabs;
  searchResults.closedTabs = [];
  searchResults.bookmarks = [];
  searchResults.history = [];
  searchResults.actions = [{
    name: "Open Options",
    description: "Open the extension options page",
    exec: function() {
      chrome.runtime.openOptionsPage();
    }
  }];
  onComplete(searchResults);
};

/**
 * Group tabs
 * =============================================================================================================================================================
 */

function GroupTabsCmd() {
}

GroupTabsCmd.prototype = Object.create(AbstractCommand.prototype);

GroupTabsCmd.prototype.run = function(query, onComplete) {
  let searchResults = this.searchUsing(new RegExSearch(), query) || {};
  let tabs = searchResults.allTabs || [];
  let that = this;

  chrome.tabs.query({active: true, currentWindow: true}, function (cTabs) {
    searchResults.allTabs = tabs;
    searchResults.closedTabs = [];
    searchResults.bookmarks = [];
    searchResults.history = [];
    searchResults.actions = [{
      name: "Group " + that.tabStr(tabs.length),
      description: "Create a new group for all the tabs displayed in the search results",
      exec: function () {
        let ids = [];
        tabs.map(function (t) {
          ids.push(t.id);
        });
        chrome.tabs.group({tabIds: ids});
      }
    }];

    if (cTabs.length > 0) {
      let ct = cTabs[0];

      let moveAction = {
        name: "Move " + that.tabStr(tabs.length) + " to Current Group",
        description: "Move the search result tabs to this group",
        exec: function () {
          let ids = [];
          tabs.map(function (t) {
            ids.push(t.id);
          });
          chrome.tabs.group({groupId: ct.groupId, tabIds: ids});
        }
      };

      let singleAction = {
        name: "Group the Current Tab",
        description: "Create a new group for the current tab only",
        exec: function () {
          chrome.tabs.group({tabIds: [ct.id]});
        }
      };

      if (ct.groupId > 0) {
        searchResults.actions.unshift(moveAction);
      }
      searchResults.actions.push(singleAction);
    }

    onComplete(searchResults);
  });
}


/**
 * Map containing commands
 * =============================================================================================================================================================
 *
 * command ideas:
 * - /fusew fuse word search
 *
 * Shortcut key ideas:
 * - swap last tab (#283)
 */

let commands = {
  "/b": new BookmarkSearchCmd(),
  "/h": new HistorySearchCmd(),
  "/w": new WindowSearchCmd(),
  "/p": new PinnedTabSearchCmd(),

  "/fuzzy": new FuzzySearchCmd(),
  "/fuse": new FuseSearchCmd(),
  "/regex": new RegExpSearchCmd(),
  "/subs": new SubStrSearchCmd(),

  "/close": new CloseTabsCmd(),
  "/merge": new MergeTabsCmd(),
  "/split": new SplitTabsCmd(),
  "/reload": new ReloadTabsCmd(),
  "/mute": new MuteTabsCmd(),
  "/unmute": new UnmuteTabsCmd(),
  "/copy": new CopyTabsCmd(),
  "/o": new OpenOptionsCmd(),
};

/**
 *  check to make sure the group function is available before we add these commands
 */
if(chrome.tabs.group) {
  commands["/g"] = new GroupSearchCmd();
  commands["/group"] = new GroupTabsCmd();
}

function searchType() {
  var searchType = Config.get(SEARCH_TYPE);
  var oldFuzzySetting = "fuseT1";
  switch (Config.get(SEARCH_FUZZY)) {
    case "true":
      oldFuzzySetting = "fuse";
      break;
    case "false":
      oldFuzzySetting = "regex";
      break;
  }
  return searchType ? searchType : oldFuzzySetting;
}

})();
