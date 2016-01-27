/*
 Copyright (c) 2009 - 2015, Evan Jehu
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

/**
 * lazy variable to address the background page
 */
var bg = chrome.extension.getBackgroundPage();

/**
 * connect to the background page on opening
 */
var bgMessagePort = chrome.runtime.connect({name: "qtPopup"});

/**
 * log name constant
 */
var LOG_SRC = "POPUP";

/**
 * current search string
 */
var searchStr = "";

/**
 * empty variable used to cache the browser history once it has been loaded
 */
var historyCache = null;

/**
 * max number of search results to show when searching bookmarks and history.
 */
var MAX_NON_TAB_RESULTS = 50;

/**
 * minimum tabs required before bookmarks get searched.
 */
var MIN_TAB_ONLY_RESULTS = 5;


/**
 * Simple little timer class to help with optimizations
 */
function Timer() {
  this.start = this.last = (new Date).getTime();
}
Timer.prototype.log = function(id) {
  var now = (new Date).getTime();
  log(id + " total time " + (now - this.start) + " m/s, delta " + (now - this.last) + " m/s");
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
  if (bg.debug) {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(LOG_SRC);
    bg.log.apply(bg, args);
  }
}

function openInNewTab(url) {
  log("opening new tab", url);
  chrome.tabs.create({url: url, index: 1000});
  return closeWindow();
}

function closeWindow() {
  /**
   * unbind document events before closing the popup window, see issue
   * Chrome shortcuts do not work immediately after using quicktabs #95
   */
  log("Unbinding document event handlers.");
  $(document).unbind();
  window.close();
  return false;
}

function closeTabs(tabIds) {
  bg.recordTabsRemoved(tabIds, function() {
    for (var x = 0; x < tabIds.length; x++) {
      var tabId = tabIds[x];
      chrome.tabs.remove(tabId);
      $("#" + tabId).fadeOut("fast").remove();
    }
    $('.closed').remove();
  })
}

function scrollToFocus() {
  var element = $(".withfocus");

  var offset = element.offset().top;
  var elementHeight = element.outerHeight(true) * 2;

  var visible_area_start = $(window).scrollTop();
  var visible_area_end = visible_area_start + window.innerHeight;

  if (offset < visible_area_start + elementHeight) {
    // scrolling up
    $('html,body').animate({scrollTop: offset - elementHeight}, 10);
    return false;
  } else if (offset > visible_area_end - elementHeight) {
    // scrolling down
    $('html,body').animate({scrollTop: offset - window.innerHeight + elementHeight}, 10);
    return false;
  }
  return true;
}

function focus(elem) {
  $(".withfocus").removeClass('withfocus');
  elem.addClass('withfocus');
}

function entryWithFocus() {
  return $(".withfocus");
}

function isFocusSet() {
  return entryWithFocus().length > 0;
}

function focusFirst() {
  return $(".item:first").addClass("withfocus");
}

function focusLast() {
  return $(".item:last").addClass("withfocus");
}

function focusPrev(skip) {
  skip = skip || 1;
  entryWithFocus().removeClass('withfocus').prevAll(".item").eq(skip - 1).addClass('withfocus');
  if (!isFocusSet()) {
    (skip == 1 ? focusLast : focusFirst)();
  }

  scrollToFocus();
}

function focusNext(skip) {
  skip = skip || 1;
  entry = entryWithFocus().removeClass('withfocus').nextAll(".item").eq(skip - 1).addClass('withfocus');
  if (!isFocusSet()) {
    (skip == 1 ? focusFirst : focusLast)();
  }

  scrollToFocus();
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
    if (queriedTabsMap.hasOwnProperty(extraTab) && bg.includeTab(queriedTabsMap[extraTab])) {
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

$(document).ready(function() {

  pageTimer.log("Document ready");

  $('<style/>').text(bg.getCustomCss()).appendTo('head');

  $(document).bind('keydown.down', function() {
    focusNext();
    return false;
  });

  $(document).bind('keydown.up', function() {
    focusPrev();
    return false;
  });

  $(document).bind('keydown.tab', function() {
    focusNext();
    return false;
  });

  $(document).bind('keydown.shift_tab', function() {
    focusPrev();
    return false;
  });

  (function(skipSize) {
    $(document).bind('keydown.pagedown', function() {
      focusNext(skipSize);
    });

    $(document).bind('keydown.pageup', function() {
      focusPrev(skipSize);
    });
  }(bg.pageupPagedownSkipSize()));

  $(document).bind('keydown.return', function() {
    if (!isFocusSet()) {
      focusFirst();
    }

    if (isFocusSet()) {
      entryWithFocus().trigger("click");
    } else {
      var inputText = $("#searchbox");
      var url = inputText.val();

      if (!/^https?:\/\/.*/.exec(url)) {
        url = "http://" + url;
      }

      log("no tab selected, " + url);
      if (/^(http|https|ftp):\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(:[a-zA-Z0-9]*)?\/?([a-zA-Z0-9\-\._\?,'/\\\+&amp;%$#=~])*$/.exec(url)) {
        chrome.tabs.create({url: url});
      } else {
        //url = "http://www.google.com/search?q=" + encodeURI($("input[type=text]").val());
        url = bg.getSearchString().replace(/%s/g, encodeURI(inputText.val()));
        chrome.tabs.create({url: url});
        closeWindow();
      }
    }

    return false;
  });

  $(document).bind('keydown.' + bg.getCloseTabKey().pattern(), function() {
    bg.swallowSpruriousOnAfter = true;
    if (!isFocusSet()) {
      focusFirst();
    }
    var attr = entryWithFocus().attr('id');
    if (attr) {
      var tabId = parseInt(attr);
      if (entryWithFocus().nextAll(".open").length == 0) {
        focusPrev();
      } else {
        focusNext();
      }
      closeTabs([tabId]);
    }
    return false;
  });

  $(document).bind('keydown.' + bg.getCloseAllTabsKey().pattern(), function() {
    var tabids = [];
    $('.open').each(function() {
      tabids.push(parseInt($(this).attr('id')));
    });
    closeTabs(tabids);
    return false;
  });

  $(document).bind('keydown.esc', function() {
    return closeWindow();
  });

  $('#searchbox').on({
    'keyup': executeSearch
  });

  pageTimer.log("Document ready completed");

  //Method needs to be called after the document is ready
  setTimeout(function() {
    drawCurrentTabs();
  }, 100);
});

function drawCurrentTabs() {
  /**
   * This seems kinda nasty but it ensures that we are rendering the latest title information for the tabs
   * since this can be updated after pages have loaded
   */
  chrome.tabs.query({}, function(queryResultTabs) {

    // assign the cleaned tabs list back to background.js
    bg.tabs = compareTabArrays(bg.tabs, queryResultTabs);

    // render only the tabs and closed tabs on initial load (hence the empty array [] for bookmarks)
    renderTabs({
      allTabs: bg.tabs, closedTabs: bg.closedTabs,
      bookmarks: [], type: "all"
    });
  });
}

function renderTabs(params) {
  if (!params) {
    return;
  }

  pageTimer.log("sending render tabs message");

  var context = {
    'type': params.type || "all",
    'tabs': params.allTabs || [],
    'closedTabs': params.closedTabs || [],
    'bookmarks': params.bookmarks || [],
    'history': params.history || [],
    'closeTitle': "close tab (" + bg.getCloseTabKey().pattern() + ")",
    'tabImageStyle': bg.showFavicons() ? "tabimage" : "tabimage hideicon",
    'urlStyle': bg.showUrls() ? "" : "nourl",
    'urls': bg.showUrls(),
    'tips': bg.showTooltips()
  };

  var iframe = document.getElementById('theFrame');

  var message = {
    command: 'render',
    context: context
  };

  iframe.contentWindow.postMessage(message, '*');
}

/**
 * receive the rendered template message from the sandbox frame and insert it into the popup window DOM, then apply any event handlers
 */
window.addEventListener('message', function(event) {

  if (event.data.html) {

    //$("#content-list").html(event.data.html);
    document.getElementById("content-list").innerHTML = event.data.html;

    $('.open').on('click', function() {
      bg.switchTabsWithoutDelay(parseInt(this.id), function() {
        closeWindow();
      });
    });

    $('.closed').on('click', function() {
      // create a new tab for the window
      openInNewTab(this.getAttribute('data-path'));
    });

    $('.bookmark').on('click', function() {
      // create a new tab for the window
      openInNewTab(this.getAttribute('data-path'));
    });

    $('.history').on('click', function() {
      // create a new tab for the window
      openInNewTab(this.getAttribute('data-path'));
    });

    $('.close').on('click', function() {
      closeTabs([parseInt(this.id.substring(1))])
    });

    pageTimer.log("tab template rendered");
  }
});

/**
 * listen to the background page for key presses and trigger the appropriate responses
 */
bgMessagePort.onMessage.addListener(function(msg) {
  //log("popup message!", msg);
  if (msg.move == "next") {
    focusNext();
  } else if (msg.move == "prev") {
    focusPrev();
  }
});

/**
 * =============================================================================================================================================================
 * Search related functionality
 * =============================================================================================================================================================
 */

/**
 * If the search string hasn't changed, the keypress wasn't a character
 * but some form of navigation, so we can stop.
 *
 * @returns {boolean}
 */
function shouldSearch() {
  var str = $("#searchbox").val();
  return searchStr != str;
}

/**
 * Load all of the browser history and search it for the best matches
 *
 * @param searchStr
 * @param since
 */
function searchHistory(searchStr, since) {
  var doSearch = function(h) {
    renderTabs({
      history: searchTabArray(searchStr, h).slice(0, MAX_NON_TAB_RESULTS),
      type: "search"
    });
  };

  /**
   * compile the history filter regexp
   */
  var filterString = bg.getHistoryFilter().trim();
  var filterRegEx = filterString.length > 0 ? new RegExp(filterString) : null;

  /**
   * test each url against a regular expression to see if it should be included in the history search
   * https?:\/\/www\.(google|bing)\.(ca|com|co\.uk)\/(search|images)
   */
  var includeUrl = function(url) {
    return !filterRegEx || !filterRegEx.exec(url);
  };

  if (historyCache != null) {
    // use the cached values
    doSearch(historyCache);
  } else {
    // load browser history
    chrome.history.search({text: "", maxResults: 1000000000, startTime: since}, function(result) {

      var includeView = function(v) {
        return v.url && v.title && includeUrl(v.url)
      };

      historyCache = result.filter(includeView);

      log("loaded history for search", historyCache.length);

      doSearch(historyCache);
    })
  }
}

/**
 * Retrieve the search string from the search box and search the different tab groups following these rules:
 *
 * - if the search string starts or ends with 3 spaces ('   ') search the entire browser history
 * - if the search string starts or ends with 2 spaces ('  ') only search bookmarks
 * - if the search string starts or ends with 1 space (' ') search tabs and bookmarks
 * - otherwise search tabs unless there are less than 5 results in which case include bookmarks
 *
 */
function executeSearch() {

  if (!shouldSearch()) {
    return;
  }

  pageTimer.reset();

  // The user-entered value we're searching for
  searchStr = $('#searchbox').val();

  // Filter!
  var filteredTabs = [];
  var filteredClosed = [];
  var filteredBookmarks = [];

  if (searchStr.trim().length === 0) {
    // no need to search if the string is empty
    filteredTabs = bg.tabs;
    filteredClosed = bg.closedTabs;
  } else if (searchStr === "<))") {
    filteredTabs = audibleSearch(searchStr, bg.tabs);
  } else if (startsWith(searchStr, "   ") || endsWith(searchStr, "   ")) {
    // i hate to break out of a function part way though but...
    searchHistory(searchStr, 0);
    return;
  } else if (startsWith(searchStr, "  ") || endsWith(searchStr, "  ")) {
    filteredBookmarks = searchTabArray(searchStr, bg.bookmarks);
  } else {
    filteredTabs = searchTabArray(searchStr, bg.tabs);
    filteredClosed = searchTabArray(searchStr, bg.closedTabs);
    var resultCount = filteredTabs.length + filteredClosed.length;
    if (startsWith(searchStr, " ") || endsWith(searchStr, " ") || resultCount < MIN_TAB_ONLY_RESULTS) {
      filteredBookmarks = searchTabArray(searchStr, bg.bookmarks);
    }
  }

  pageTimer.log("search completed for '" + searchStr + "'");

  // only show the top MAX_BOOKMARK_RESULTS bookmark hits.
  renderTabs({
    allTabs: filteredTabs,
    closedTabs: filteredClosed,
    bookmarks: filteredBookmarks.slice(0, MAX_NON_TAB_RESULTS),
    type: "search"
  });
}

function searchTabArray(searchStr, tabs) {
  var searchUrls = bg.showUrls() || bg.searchUrls();
  var options = {
    pre: '{',
    post: '}',
    extract: function(element) {
      if (searchUrls) {
        return element.title + "~~" + element.url;
      } else {
        return element.title;
      }
    }
  };

  return fuzzy.filter(searchStr.trim(), tabs, options).sort(function(a, b){
      return b.score - a.score;
  }).map(function(entry) {
    var parts = entry.string.split(/~~/);
    // return a copy of the important fields for template rendering
    return {
      title: parts[0],
      displayUrl: parts[1],
      url: entry.original.url,
      id: entry.original.id,
      favIconUrl: entry.original.favIconUrl
    }
  });
}

function audibleSearch(searchStr, tabs) {
  return $.grep(tabs, function(t) {
    return (t.audible && searchStr === "<))");
  });
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
