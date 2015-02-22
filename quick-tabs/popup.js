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

var bg = chrome.extension.getBackgroundPage();
var LOG_SRC = "POPUP";
var searchStr = "";

// Simple little timer class to help with optimizations
function Timer() {
  this.start = (new Date).getTime();
  this.last = this.start;
}
Timer.prototype.log = function(id) {
  var now = (new Date).getTime();
  log(id + " total time " + (now - this.start) + " m/s, delta " + (now - this.last) + " m/s");
  this.last = now;
};

/**
 * Log call that prepends the LOG_SRC before delegating to the background page to simplify debugging
 */
function log() {
  var args = Array.prototype.slice.call(arguments);
  args.unshift(LOG_SRC);
  bg.log.apply(bg, args);
}

function openInNewTab(url) {
  chrome.tabs.create({url:url, index:1000});
  window.close();
}

function closeTabs(tabIds) {
  bg.recordTabsRemoved(tabIds, function() {
    for(var x = 0; x < tabIds.length; x++) {
      var tabId = tabIds[x];
      chrome.tabs.remove(tabId);
      $("#" + tabId).fadeOut("fast").remove();
    }
    $('.tab.closed').remove();
  })
}

function scrollToFocus(offset) {
  $('.content').stop().scrollTo('.withfocus', 100, {offset:{top:offset, left:0}});
}

function focus(elem) {
  $(".withfocus").removeClass('withfocus');
  elem.addClass('withfocus');
}

function entryWithFocus() {
  return $(".item.withfocus:visible");
}

function isFocusSet() {
  return entryWithFocus().length > 0;
}

function focusFirst() {
  return $(".item:visible:first").addClass("withfocus");
}

function focusLast() {
  return $(".item:visible:last").addClass("withfocus");
}

function focusPrev(skip) {
  skip = skip || 1;
  entryWithFocus().removeClass('withfocus').prevAll(".item:visible").eq(skip - 1).addClass('withfocus');
  if(!isFocusSet()) {
    (skip == 1 ? focusLast : focusFirst)();
  }
  
  if(!currentFocusInsideBody()) { 
    scrollToFocus(-10);
  }
}

function focusNext(skip) {
  skip = skip || 1;
  entry = entryWithFocus().removeClass('withfocus').nextAll(".item:visible").eq(skip - 1).addClass('withfocus');
  if(!isFocusSet()) {
    (skip == 1 ? focusFirst : focusLast)();
  }
  
  if(!currentFocusInsideBody()) { 
    scrollToFocus(-394);
  }
}

function currentFocusInsideBody() {
  return bodyHeight() > currentFocusedBottom() && currentFocusedTop() > 10;
}

function bodyHeight() {
  return $("body")[0]. getBoundingClientRect().height;
}

function currentFocusedTop() {
  return entryWithFocus()[0]. getBoundingClientRect().top;
}

function currentFocusedBottom() {
  return entryWithFocus()[0]. getBoundingClientRect().bottom;
}

/**
 * The following piece of code was copied from https://github.com/olado/doT/blob/master/doT.js
 * DoT needs this prototype extension in order to encode HTML code inside "{{! }}".
 * @copyright Laura Doktorova, 2011
 */
function encodeHTMLSource() {
  var encodeHTMLRules = { "&": "&#38;", "<": "&#60;", ">": "&#62;", '"': '&#34;', "'": '&#39;', "/": '&#47;' },
      matchHTML = /&(?!#?\w+;)|<|>|"|'|\//g;
  return function() {
    return this ? this.replace(matchHTML, function(m) {return encodeHTMLRules[m] || m;}) : this;
  };
}
String.prototype.encodeHTML = encodeHTMLSource();

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
    if(!recordedTabsList[x]) {
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

function drawCurrentTabs() {
  /**
   * This seems kinda nasty but it ensures that we are rendering the latest title information for the tabs
   * since this can be updated after pages have loaded
   */
  chrome.tabs.query({}, function(queryResultTabs) {

    var tabsToRender = compareTabArrays(bg.tabs, queryResultTabs);

    // assign the cleaned tabs list back to background.js
    bg.tabs = tabsToRender;
    renderTabs({allTabs: bg.tabs, closedTabs: bg.closedTabs, 
      bookmarks: bg.bookmarks, type: "all"});
  });
}

$(document).ready(function() {

  var timer = new Timer();

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

  // Determine which next/previous style keybindings to use
  if (bg.nextPrevStyle() === 'ctrlj') {
    $(document).bind('keydown.ctrl_j', function () {
      bg.swallowSpruriousOnAfter = true;
      focusNext();
      return false;
    });
    $(document).bind('keydown.ctrl_k', function () {
      bg.swallowSpruriousOnAfter = true;
      focusPrev();
      return false;
    });
  } else {
    $(document).bind('keydown.ctrl_n', function () {
      bg.swallowSpruriousOnAfter = true;
      focusNext();
      return false;
    });
    $(document).bind('keydown.ctrl_p', function () {
      bg.swallowSpruriousOnAfter = true;
      focusPrev();
      return false;
    });
  }

  $(document).bind('keydown.return', function() {
    if(!isFocusSet()) {
      focusFirst();
    }
    
    if(isFocusSet()) {
      entryWithFocus().trigger("click");
    } else {
      var inputText = $("input[type=text]");
      var url = inputText.val();
      
      if(!/^https?:\/\/.*/.exec(url)) {
        url = "http://" + url;
      }
      
      log("no tab selected, " + url);
      if (/^(http|https|ftp):\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(:[a-zA-Z0-9]*)?\/?([a-zA-Z0-9\-\._\?,'/\\\+&amp;%$#=~])*$/.exec(url)) {
        chrome.tabs.create({url: url});
      } else {
        //url = "http://www.google.com/search?q=" + encodeURI($("input[type=text]").val());
        url = bg.getSearchString().replace(/%s/g, encodeURI(inputText.val()));
        chrome.tabs.create({url: url});
        window.close();
      }
    }
    
    return false;
  });

  $(document).bind('keydown.' + bg.getCloseTabKey().pattern(), function() {
    bg.swallowSpruriousOnAfter = true;
    if(!isFocusSet()) {
      focusFirst();
    }
    var attr = entryWithFocus().attr('id');
    if(attr) {
      var tabId = parseInt(attr);
      if ( entryWithFocus().nextAll("div.open").length == 0 ) {
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
    $('.tab.open:visible').each(function () {
      tabids.push(parseInt($(this).attr('id')));
    });
    closeTabs(tabids);
    return false;
  });

  $(document).bind('keydown.esc', function() {
    window.close();
    return false;
  });

  timer.log("Document ready");
  
  //Method needs to be called after the document is ready
  setTimeout(function() { drawCurrentTabs(); }, 100);
});

window.addEventListener('message', function(event) {

  var tabTimer = new Timer();

  if (event.data.html) {

    var template = $(".template");

    template.html(event.data.html);

    $('.tab.open').on('click', function() {
      bg.switchTabs(parseInt(this.id), function() {
        window.close();
      });
    });

    $('.tab.closed').on('click', function() {
      var i = parseInt(this.id.substring(1));
      // create a new tab for the window
      openInNewTab(bg.closedTabs[i].url);
      // remove the tab from the closed tabs list
      bg.closedTabs.splice(i, 1);
    });
    
    $('.bookmark').on('click', function() {
      var i = parseInt(this.id.substring(1));
      // create a new tab for the window
      openInNewTab(bg.bookmarks[i].url);
      // remove the tab from the closed tabs list
      bg.closedTabs.splice(i, 1);
    });

    $('.item').on('mouseover', function() {
      focus($(this));
    });

    $('.close').on('click', function() {
      closeTabs([parseInt(this.id.substring(1))])
    });

    $('#searchbox').quicksearch('.item', {
      delay: 50,
      testQuery: function (query, txt, _row) {
        return passesCheck(query, txt, $(_row).hasClass("bookmark"));
      },
      prepareQuery: function (val) {
        return new RegExp(val, "i");
      },
      onAfter: function() {
        
        if (bg.swallowSpruriousOnAfter) {
          bg.swallowSpruriousOnAfter = false;
          return;
        }
        
        var str = $("input[type=text]").val();
        if (!shouldSearch()) { return; }
        searchStr = str;
        
        // refreshSearchedItems(searchStr);
        adjustItemsAfterSearch();
        applyHiglight(str);
      }
    });

    tabTimer.log("tab template rendered");
  }
});

function shouldSearch() {
  var str = $("input[type=text]").val();
  // If the search string hasn't changed, the keypress wasn't a character
  // but some form of navigation, so we can stop.
  if (searchStr == str) { return false; }
  
  return true;
}

function applyHiglight(searchedString) {
  var hilite = $(".hilite");
  hilite.removeHighlight();
  if (searchedString.length > 0) {
    hilite.highlight(searchedString);
  }
  
  // Put the ones with title matches on top, url matches after
  var in_title = $('div.tab:visible:has(.title>.highlight)'),
      in_url = $('div.tab:visible:not(:has(.title>.highlight))');
      
  if (in_title && in_url) {
    $('div.template').prepend(in_title, in_url);
  }
  // update the selected item
  $(".item.withfocus").removeClass("withfocus");
  
  focusFirst();
}

function renderTabs(params) {
    if (!params) { return; }
    
    var context = {
    'tabs': params.allTabs,
    'type': params.type,
    'closedTabs': params.closedTabs,
    'bookmarks': params.bookmarks,
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

function adjustItemsAfterSearch() {
  var hasBookmarks = $(".bookmark:visible").length > 0;
  
  var separator = $("div.separator.big");
  if(hasBookmarks) {
    separator.show();
  } else {
    separator.hide();
  }
  
  var hasItems = $(".item:visible").length > 0;
  
  var noResults = $("div.noresult");
  if(hasItems) {
    noResults.hide();
  } else {
    noResults.show();
  }
}

function stringFromQuery(query) {
  var q = query.toString();
  q = q.substring(1, q.length -2)
  return q;
}

function passesCheck(query, string, isBookmark) {
  var bookmarkRegex = /^  .*/i;
  var stringQuery = stringFromQuery(query);

  if (stringQuery.search(bookmarkRegex) == -1) {
    //Search for tabs and bookmarks
    return query.test(string);
  }
  
  //Search for bookmarks only
  if (!isBookmark) { return false; }
  stringQuery = stringQuery.substring(2);

  //in case of empty string, retrun all bookmarks
  if (stringQuery.length == 0) { return true; }
  query = RegExp(stringQuery, 'i');
  return query.test(string);
}
