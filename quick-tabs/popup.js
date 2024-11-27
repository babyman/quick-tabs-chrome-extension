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

(async function() {

async function bg(name, arg) {
  return await chrome.runtime.sendMessage({ call: name, arg });
}

await Config.init();

if (getUrlParameter('firstRun') === 'true') {
  await chrome.runtime.sendMessage({ firstRun: true });
}

let bgTabs = await bg('getTabs') || [];
let bgClosedTabs = await bg('getClosedTabs') || [];
let bgBookmarks = await bg('getBookmarks') || [];

/**
 * connect to the background page on opening
 */
var bgMessagePort = chrome.runtime.connect({name: "qtPopup"});

/**
 * log name constant
 */
const LOG_SRC = "POPUP";

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
const MAX_NON_TAB_RESULTS = 50;

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

Timer.prototype.log = function() {
  var args = Array.prototype.slice.call(arguments);
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

/**
 * Log call that prepends the LOG_SRC before delegating to the background page to simplify debugging
 */
function log() {
  if (Config.get(DEBUG)) {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(LOG_SRC);
    bg('log', args);
  }
}

function openInNewTab(url) {
  log("opening new tab", url);
  chrome.tabs.create({url: url, index: 1000});
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

function closeTabs(tabIds) {
  bg('recordTabsRemoved', tabIds);
  for (var x = 0; x < tabIds.length; x++) {
    var tabId = tabIds[x];
    chrome.tabs.remove(tabId);
    $("#" + tabId).fadeOut("fast").remove();
  }
  $('.closed').remove();
}

function removeBookmark(bookmarkId) {
  let id = bookmarkId.match(/\d+/g)[0];
  chrome.bookmarks.remove(id);
  $(`#${bookmarkId}`).fadeOut("fast").remove();
}

function entryWithFocus() {
  return $(".withfocus");
}

function isFocusSet() {
  return entryWithFocus().length > 0;
}

function scrollToFocus() {
  const element = entryWithFocus();

  // make sure we have an element to scroll to
  if (element.length > 0) {
    const offset = element.offset().top;
    const elementHeight = element.outerHeight(true) * 2;

    const visible_area_start = $(window).scrollTop();
    const visible_area_end = visible_area_start + window.innerHeight;

    if (offset < visible_area_start + elementHeight) {
      // scrolling up
      window.scroll({top: offset - elementHeight, left: 0, behavior: 'smooth'});
    } else if (offset > visible_area_end - elementHeight) {
      // scrolling down
      window.scroll({top: offset - window.innerHeight + elementHeight, left: 0, behavior: 'smooth'});
    }
  }
}

function focus(elem) {
  entryWithFocus().removeClass('withfocus');
  elem.addClass('withfocus');
  scrollToFocus();
}

function focusFirst() {
  focus($(".item:first"));
}

function focusLast() {
  focus($(".item:last"))
}

function focusPrev(skip) {
  skip = skip || 1;
  entryWithFocus().removeClass('withfocus').prevAll(".item").eq(skip - 1).addClass('withfocus');
  if (!isFocusSet()) {
    (skip === 1 ? focusLast : focusFirst)();
  }

  scrollToFocus();
}

function focusNext(skip) {
  skip = skip || 1;
  entryWithFocus().removeClass('withfocus').nextAll(".item").eq(skip - 1).addClass('withfocus');
  if (!isFocusSet()) {
    (skip === 1 ? focusFirst : focusLast)();
  }

  scrollToFocus();
}

window.addEventListener('blur', function() {
  // log("lost focus");
  if (!Config.get(INCLUDE_DEV_TOOLS)) { // to be able to inspect popup set the already existing flag to keep it open onblur
    closeWindow(); // ensure popup closes when switching to other window (including non-chrome) so hotkeys keep working
  }
});

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
      tabsToRender.push(tab);
      delete queriedTabsMap[id];
    } else {
      log("  tab found that is not currently reported as open: ", recordedTabsList[x]);
      delete queriedTabsMap[id];
    }
  }

  for (var extraTab in queriedTabsMap) {
    if (queriedTabsMap.hasOwnProperty(extraTab) && Utils.includeTab(queriedTabsMap[extraTab])) {
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

  // pageTimer.log("Document ready");

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

  $('<style/>').text(Config.get(CUSTOM_CSS)).appendTo('head');

  $(document).on('keydown.down', function() {
    focusNext();
    return false;
  });

  $(document).on('keydown.up', function() {
    focusPrev();
    return false;
  });

  $(document).on('keydown.tab', function() {
    focusNext();
    return false;
  });

  $(document).on('keydown.shift_tab', function() {
    focusPrev();
    return false;
  });

  $(document).on('keydown.home', function(e) {
    focusFirst();
    return false;
  });

  $(document).on('keydown.end', function(e) {
    focusLast();
    return false;
  });

  (function(skipSize) {
    $(document).on('keydown.pagedown', function(e) {
      e.preventDefault();
      focusNext(skipSize);
    });

    $(document).on('keydown.pageup', function(e) {
      e.preventDefault();
      focusPrev(skipSize);
    });
  }(Config.get(PAGEUP_PAGEDOWN_SKIP_SIZE)));

  $(document).on('keydown.' + Config.getKeyCombo(NEW_TAB_POPUP).pattern(), function() {
    openTabForSearch($("#searchbox").val());
    return false;
  });

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

  $(document).on('keydown.' + Config.getKeyCombo(CLOSE_TAB_POPUP).pattern(), function() {
    if (!isFocusSet()) {
      focusFirst();
    }
    var attr = entryWithFocus().attr('id');
    if (attr) {
      var tabId = parseInt(attr);
      if (entryWithFocus().nextAll(".open").length === 0) {
        focusPrev();
      } else {
        focusNext();
      }
      closeTabs([tabId]);
    }
    return false;
  });

  $(document).on('keydown.esc', function() {
    return closeWindow();
  });

  $('#searchbox').on({
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
      renderTabsExceptCurrent(results, 100);
    });
  } else {
    drawCurrentTabs();
  }
  // pageTimer.log("Document ready completed");

});

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
      renderTabsExceptCurrent({
        allTabs: tabs,
        closedTabs: bgClosedTabs
      }, 100);
    });
  });
}

/**
 * renders all the params tabs except the current one
 * @param params an object that contains the various tab lists to be rendered
 * @param delay (optional) - how long before we render the tab list to the popup html
 */
function renderTabsExceptCurrent(params, delay) {
  chrome.tabs.query({currentWindow: true, active: true}, function(tab) {
    renderTabs(params, delay, tab[0]);
  });
}

/**
 * sort out the tabs and execute the popup template rendering.
 *
 * @param params an object that contains the various tab lists to be rendered
 * @param delay (optional) - how long before we render the tab list to the popup html
 * @param currentTab (optional) - what is the current tab, if defined it will be excluded from the render list
 */
function renderTabs(params, delay, currentTab) {
  if (params === null) {
    return;
  }

  pageTimer.log("start rendering tab template");

  const wins = [];
  var allTabs = (params.allTabs || []).reduce(function(result, obj) {
    if (currentTab && obj.id === currentTab.id) {
      log(obj.id, currentTab.id, obj.id !== currentTab.id, obj, currentTab);
    }
    if (Utils.includeTab(obj) && (!currentTab || obj.id !== currentTab.id)) {
      obj.templateTabImage = tabImage(obj);
      obj.templateTitle = encodeHTMLSource(obj.title);
      obj.templateTooltip = stripTitle(obj.title);
      obj.templateUrl = encodeHTMLSource(obj.displayUrl || obj.url);
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

  var closedTabs = (params.closedTabs || []).map(function(obj) {
    obj.templateTabImage = tabImage(obj);
    obj.templateTitle = encodeHTMLSource(obj.title);
    obj.templateTooltip = stripTitle(obj.title);
    obj.templateUrl = encodeHTMLSource(obj.displayUrl || obj.url);
    obj.templateUrlPath = encodeHTMLSource(obj.url);
    return obj;
  });

  let toSearchableObj = function(obj) {
    obj.templateTitle = encodeHTMLSource(obj.title);
    obj.templateTooltip = stripTitle(obj.title);
    obj.templateUrlPath = encodeHTMLSource(obj.url);
    obj.templateUrl = encodeHTMLSource(obj.displayUrl);
    obj.templateId = encodeHTMLSource(obj.id);
    return obj;
  };

  var bookmarks = (params.bookmarks || []).map(toSearchableObj);
  var history = (params.history || []).map(toSearchableObj);

  var actions = (params.actions || []).map(function(obj, index) {
    obj.id = index;
    return obj
  });

  var context = {
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
    'noResults': allTabs.length === 0 && closedTabs.length === 0 && bookmarks.length === 0 && history.length === 0,
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

    focusFirst();

    // create a new tab for the window
    let fOpenNewTab = function(e) {
      e.stopPropagation();
      openInNewTab(this.getAttribute('data-path'));

      if (this.classList.contains('closed')) {
        bg('removeClosedTab', this.getAttribute('data-path'));
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

    $('.open').on('mousedown', function(e) {
      if(e.button === 1) {
        e.preventDefault();
        closeTabs([parseInt(this.id)]);
      }
    });

    $('.close').on('click', function(e) {
      e.stopPropagation();
      closeTabs([parseInt(this.id.substring(1))]);
    });

    $('.remove').on('click', function(e) {
      e.stopPropagation();
      removeBookmark(this.parentNode.parentNode.id);
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

    pageTimer.log("tab template rendered");
  }, delay || 1);
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
  } else if (tab.favIconUrl && (startsWith(tab.favIconUrl, "data:") || /^https?:\/\/.*/.exec(tab.favIconUrl))) {
    // if the favicon is a valid URL or embedded data return that
    return tab.favIconUrl;
  } else if (/^chrome:\/\/extensions\/.*/.exec(tab.url)) {
    return "/assets/chrome-extensions-icon.png";
  } else {
    return "/assets/blank.png"
  }
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
function performQuery(q, onComplete) {

  if (!AbstractSearch.prototype.shouldSearch(q)) {
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
  const audibleQuery = "<))";

  pageTimer.reset();

  // Filter!
  var filteredTabs = [];
  var filteredClosed = [];
  var filteredBookmarks = [];

  if (query.trim().length === 0) {
    // no need to search if the string is empty
    filteredTabs = bgTabs.filter(Utils.validTab);
    filteredClosed = bgClosedTabs;
  } else if (query === audibleQuery) {
    filteredTabs = bgTabs.filter(tab => Utils.validTab(tab) && filterAudible(tab))
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
AbstractSearch.prototype.searchHistory = function(searchStr, since) {
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
    chrome.history.search({text: "", maxResults: 1000000000, startTime: since}, function(result) {

      var includeView = function(v) {
        return v.url && v.title && includeUrl(v.url)
      };

      historyCache = result.filter(includeView);

      log("loaded history for search", historyCache.length, " (unfiltered: ", result.length, ")");

      doSearch(historyCache);
    })
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
      title: parts[0],
      displayUrl: parts[1],
      url: entry.original.url,
      id: entry.original.id,
      groupId: entry.original.groupId,
      windowId: entry.original.windowId,
      pinned: entry.original.pinned,
      favIconUrl: entry.original.favIconUrl
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
    location: 0,
    distance: 1000, // such a high value since searchterm can appear anywhere within URL/Title
    // thus distance from location shouldn't matter much, hence increasing distance.
    shouldSort: true,
    includeMatches: true,
    maxPatternLength: 32,
    minMatchCharLength: 1,
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

  switch (Config.get(SEARCH_TYPE)) {
    case 'fuseT1':
    default:
      options.threshold = 0.6; //needs higher values since pure fuzzy search results have higher scores
      //keep options as set above
      break;
    case 'fuseT2':
      options.tokenize = true;
      options.matchAllTokens = true;
      options.threshold = 0.4; //can afford lower one since result scores are overall lower and near zero if words match
      break;
  }

  var fuse = new Fuse(tabs, options);

  return fuse.search(query.trim()).map(function(result) {
    var highlighted = this.highlightResult(result);
    return {
      title: highlighted.title || result.item.title,
      displayUrl: highlighted.url || result.item.url,
      url: result.item.url,
      id: result.item.id,
      groupId: result.item.groupId,
      windowId: result.item.windowId,
      pinned: result.item.pinned,
      favIconUrl: result.item.favIconUrl
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
        title: highlightedTitle || tab.title,
        displayUrl: highlightedUrl || tab.url,
        url: tab.url,
        id: tab.id,
        groupId: tab.groupId,
        windowId: tab.windowId,
        pinned: tab.pinned,
        favIconUrl: tab.favIconUrl
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
        title: highlightedTitle || tab.title,
        displayUrl: highlightedUrl || tab.url,
        url: tab.url,
        id: tab.id,
        groupId: tab.groupId,
        windowId: tab.windowId,
        pinned: tab.pinned,
        favIconUrl: tab.favIconUrl
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
