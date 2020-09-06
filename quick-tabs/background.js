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

/**
 * Utility Objects
 */
function DelayedFunction(f, timeout) {

  var complete = false;

  var timeoutRef = setTimeout(function() {
    _invoke();
  }.bind(this), timeout);

  // private, see http://javascript.crockford.com/private.html
  function _invoke() {
    complete = true;
    f();
  }

  this.call = function() {
    if (!complete) {
      _invoke();
    }
  };

  this.cancel = function() {
    complete = true;
    clearTimeout(timeoutRef);
    tabOrderUpdateFunction = null; // have to set variable null so that it's evaluated as false
  };
}

/**
 * Returns a function, that, as long as it continues to be invoked, will not
 * be triggered. The function will be called after it stops being called for
 * N milliseconds. If `immediate` is passed, trigger the function on the
 * leading edge, instead of the trailing.
 */
function debounce(func, wait, immediate) {
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
}


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

/**
 * arrays to hold the current order of the tabs, closed tabs and bookmarks
 */
var tabs = [];
var closedTabs = [];
var bookmarks = [];

/**
 * tabs[index] of tab that's currently active/focused
 */
var activeTabsIndex = 0;


/**
 * use a DelayedFunction so that it can be canceled if another tab is selected before the timer
 * has triggered or called if the user loads the popup before the timer fires
 */
var tabOrderUpdateFunction = null;

/**
 * allow the popup window to trigger a tab order update that skips the timer delay,
 * see switchTabsWithoutDelay(...)
 */
var skipTabOrderUpdateTimer = null;

/**
 * message port opened by the popup window to allow shortcut key messages, will be null
 * if the popup is not currently displayed
 */
var popupMessagePort = null;

/**
 * base color for the badge text
 */
var badgeColor = {color: [32, 7, 114, 255]};

/**
 * badge text color while the tab order update timer is active
 */
var tabTimerBadgeColor = {color: [255, 106, 0, 255]};

var debug = loadDebug();

var re = /^https?:\/\/.*/;

function isWebUrl(url) {
  return re.exec(url);
}

/**
 * Simple log wrapper to centralise logging for all of the code, called from popup.js as bg.log(....)
 */
function log() {
  if (debug) {
    console.log.apply(console, Array.prototype.slice.call(arguments))
  }
}

function loadDebug() {
  var s = localStorage["debug_?"];
  return s ? s === 'true' : false;
}

/**
 * set the debug switch, this can be called from the background page JavaScript console
 * to enable/disable logging, this setting is saved to local storage.  To
 * enable logging temporarily type debug=true in the background page JS console.
 */
function setDebug(val) {
  debug = val;
  localStorage["debug_?"] = val;
}

function getClosedTabsSize() {
  var s = localStorage["closed_tabs_size"];
  return s ? parseInt(s, 10) || 0 : 10;
}

function setClosedTabsSize(val) {
  localStorage["closed_tabs_size"] = val;
  resizeClosedTabs();
}

/**
 * see https://github.com/babyman/quick-tabs-chrome-extension/issues/90
 *
 * @returns {number} delay in ms a tab must be in focus before it is moved to the top of the open tabs list
 */
function getTabOrderUpdateDelay() {
  var s = localStorage["tab_order_update_delay"];
  return s ? parseInt(s, 10) || 1500 : 1500;
}

function setTabOrderUpdateDelay(val) {
  localStorage["tab_order_update_delay"] = val;
  resizeClosedTabs();
}

function pageupPagedownSkipSize() {
  return localStorage["pageup_pagedown_skip_size"] || 5;
}

function setPageupPagedownSkipSize(val) {
  localStorage["pageup_pagedown_skip_size"] = val;
}

function showDevTools() {
  var s = localStorage["include_dev_tools"];
  return s ? s === 'true' : false;
}

function setShowDevTools(val) {
  localStorage["include_dev_tools"] = val;
}

function autoSearchBookmarks() {
  var s = localStorage["auto_search_bookmarks"];
  return s ? s === 'true' : true;
}

function setAutoSearchBookmarks(val) {
  localStorage["auto_search_bookmarks"] = val;
}

function showUrls() {
  var s = localStorage["show_urls"];
  return s ? s === 'true' : true;
}

function setShowUrls(val) {
  localStorage["show_urls"] = val;
}

/**
 * boolean option indicating if the last search string should be restored
 */
function restoreLastSearchedStr() {
  var s = localStorage["restore_last_searched_str"];
  return s ? s === 'true' : true;
}

function setRestoreLastSearchedStr(val) {
  localStorage["restore_last_searched_str"] = val;
}

function getJumpToLatestTabOnClose() {
  var s = localStorage["jumpTo_latestTab_onClose"];
  return s ? s === 'true' : false;
}

function setJumpToLatestTabOnClose(val) {
  localStorage["jumpTo_latestTab_onClose"] = val;
}

/**
 * the actual last search string
 */
function lastSearchedStr() {
  return localStorage["last_searched_str"];
}

function setLastSearchedStr(val) {
  localStorage["last_searched_str"] = val;
}

function searchType() {
  var searchType = localStorage["search_type"];
  var oldFuzzySetting = "fuseT1";
  switch (localStorage["search_fuzzy"]) {
    case "true":
      oldFuzzySetting = "fuse";
      break;
    case "false":
      oldFuzzySetting = "regex";
      break;
  }
  return searchType ? searchType : oldFuzzySetting;
}

function setSearchType(val) {
  localStorage["search_type"] = val;
}

function searchUrls() {
  var s = localStorage["search_urls"];
  return s ? s === 'true' : false;
}

function setSearchUrls(val) {
  localStorage["search_urls"] = val;
}

function showTabCount() {
  var s = localStorage["show_tab_count"];
  return s ? s === 'true' : true;
}

function setShowTabCount(val) {
  localStorage["show_tab_count"] = val;
  updateBadgeText();
}

function showTooltips() {
  var s = localStorage["show_tooltips"];
  return s ? s === 'true' : true;
}

function setShowTooltips(val) {
  localStorage["show_tooltips"] = val;
}

function showFavicons() {
  var s = localStorage["show_favicons"];
  return s ? s === 'true' : true;
}

function moveLeftOnSwitch() {
  var s = localStorage["move_left_on_switch"];
  return s ? s === 'true' : false;
}

function setMoveLeftOnSwitch(val) {
  localStorage["move_left_on_switch"] = val;
}

function moveRightOnSwitch() {
  // IMPORTANT: "move_on_switch" is a legacy name, do not change
  var s = localStorage["move_on_switch"];
  return s ? s === 'true' : false;
}

function setMoveRightOnSwitch(val) {
  // IMPORTANT: "move_on_switch" is a legacy name, do not change
  localStorage["move_on_switch"] = val;
}

/**
 * fix for #296 - Would it be possible to have an additional checkbox that enables the previous behaviour so that "Move tab to rightmost position on switch"
 * only applies if I have actually activated the extension, instead of applying all the time?
 */
function moveOnPopupSwitchOnly() {
  let s = localStorage["move_on_popup_switch_only"];
  return s ? s === 'true' : true;
}

function setMoveOnPopupSwitchOnly(val) {
  localStorage["move_on_popup_switch_only"] = val;
}

function setShowFavicons(val) {
  localStorage["show_favicons"] = val;
}

function showPinnedTabs() {
  var s = localStorage["show_pinned_tabs"];
  return s ? s === 'true' : true;
}

function setShowPinnedTabs(val) {
  localStorage["show_pinned_tabs"] = val;
}

function orderTabsInWindowOrder() {
  var s = localStorage["order_tabs_in_window_order"];
  return s ? s === 'true' : false;
}

function setOrderTabsInWindowOrder(val) {
  localStorage["order_tabs_in_window_order"] = val;
}

function getSearchString() {
  return localStorage["search_string"] || 'https://www.google.com/search?q=%s';
}

function setSearchString(val) {
  localStorage["search_string"] = val;
}

function getCustomCss() {
  return localStorage["custom_css"] || '';
}

function setCustomCss(val) {
  localStorage["custom_css"] = val;
}

function getHistoryFilter() {
  return localStorage["history_filter"] || '';
}

function setHistoryFilter(val) {
  localStorage["history_filter"] = val;
}

function getShortcutKey() {
  return getKeyCombo("key_popup", "");
}

function clearOldShortcutKey() {
  localStorage["key_popup"] = null
}

/**
 * make sure the tab is usable for search etc (see PR #314 and related issues #251, #310, #275, #313).
 */
function validTab(tab) {
  return tab && tab.title;
}

function includeTab(tab) {
  return !(!showDevTools() && /chrome-devtools:\/\//.exec(tab.url)) && !(!showPinnedTabs() && tab.pinned);
}

function getKeyCombo(savedAs, def) {
  var key = null;
  if (localStorage[savedAs]) {
    key = new ShortcutKey(JSON.parse(localStorage[savedAs]));
  } else {
    key = new ShortcutKey(def);
  }
  return key;
}

function setKeyCombo(saveAs, key) {
  localStorage[saveAs] = JSON.stringify(key);
}

function getCloseTabKey() {
  return getKeyCombo("close_tab_popup", {ctrl: true, key: "d"});
}

function setCloseTabKey(key) {
  return setKeyCombo("close_tab_popup", key);
}


function getNewTabKey() {
  return getKeyCombo("new_tab_popup", {ctrl: true, key: "return"});
}

function setNewTabKey(key) {
  key.key = 'return'; // always use return to trigger this =)
  return setKeyCombo("new_tab_popup", key);
}

function resizeClosedTabs() {
  closedTabs.splice(getClosedTabsSize());
}

function addClosedTab(tab) {
  if (isWebUrl(tab.url)) {
    //    log("adding tab " + tab.id + " to closedTabs array " + tab.url);
    closedTabs.unshift({url: tab.url, title: tab.title, favIconUrl: tab.favIconUrl});
  }
  resizeClosedTabs();
}

/**
 * search the global tabs array for a tab with the given tabId and return its index, -1 if not found
 *
 * @param tabId
 */
function indexOfTab(tabId) {
  for (var i = 0; i < tabs.length; i++) {
    if (tabId === tabs[i].id) {
      return i;
    }
  }
  return -1;
}

function indexOfTabByUrl(tabArray, url) {
  for (var i = 0; i < tabArray.length; i++) {
    if (url === tabArray[i].url) {
      return i;
    }
  }
  return -1;
}

function initBadgeIcon() {
  // set the badge colour
  chrome.browserAction.setBadgeBackgroundColor(badgeColor);
  updateBadgeText();
}

/**
 * update the number of open tabs displayed on the extensions badge/icon
 */
function updateBadgeText() {
  if (showTabCount()) {
    var val = tabs.filter(tab => validTab(tab) && includeTab(tab)).length;

    chrome.browserAction.setBadgeText({text: val + ""});
  } else {
    chrome.browserAction.setBadgeText({text: ""});
  }
}

/**
 * move the tab with tabId to the top of the global tabs array
 *
 * @param tabId
 */
function updateTabOrder(tabId) {
  // Don't update when returning to same tab: e.g. when closing extension popups, developer tools, ...
  if (tabId === tabs[0].id && !tabOrderUpdateFunction) {
    // log("New Tab is already current tab (1st in list): newTabId = ", tabId ," currentTabId = ", tabs[0].id);
    return
  }

  // change the badge color while the tab change timer is active
  chrome.browserAction.setBadgeBackgroundColor(tabTimerBadgeColor);

  if (tabOrderUpdateFunction) {
    // clear current timer
    tabOrderUpdateFunction.cancel();
  }

  // setup a new timer
  tabOrderUpdateFunction = new DelayedFunction(function() { // @TODO instead of DelayedFunction use setTimeout(fx, time)
    var idx = indexOfTab(tabId);
    if (idx >= 0) { // if tab exists in tabs[]
      //log('updating tab order for', tabId, 'index', idx);
      var tab = tabs[idx];
      tabs.splice(idx, 1); // removes tab from old position = idx
      tabs.unshift(tab); // adds tab to new position = beginning
      activeTabsIndex = 0; // sync tabs[] pointer and actual current tab

      // move the tab if required
      if (!moveOnPopupSwitchOnly()) {
        moveTab(tab)
      }
    }
    // reset the badge color
    chrome.browserAction.setBadgeBackgroundColor(badgeColor);
    tabOrderUpdateFunction.cancel(); // #note big bug. Function was never canceled and hence tabOrderUpdateFunction always true
  }, tabId === skipTabOrderUpdateTimer ? 0 : getTabOrderUpdateDelay());

  // clear the skip var
  skipTabOrderUpdateTimer = null;
}

/**
 * if the user has setup tab moving apply it here.
 * Move left is prioritised over move right.
 *
 * @param tab
 */
function moveTab(tab) {
  if(!tab.pinned) {
    if (moveLeftOnSwitch()) {
      log("moving tab to the left", tab.id);
      chrome.tabs.move(tab.id, {index: 0});
    } else if (moveRightOnSwitch()) {
      log("moving tab to the right", tab.id);
      chrome.tabs.move(tab.id, {index: -1});
    }
  }
}

function updateTabsOrder(tabArray) {
  for (var j = tabArray.length - 1; j >= 0; j--) {
    updateTabOrder(tabArray[j].id)
  }
}

function recordTab(tab) {
  if (includeTab(tab)) {
    log('recording tab', tab.id);
    tabs.push(tab);
  }
}

function recordTabsRemoved(tabIds, callback) {
  for (var j = 0; j < tabIds.length; j++) {
    var tabId = tabIds[j];
    var idx = indexOfTab(tabId);
    if (idx >= 0) {
      var tab = tabs[idx];
      addClosedTab(tab);
      tabs.splice(idx, 1);
      updateBadgeText();
    } else {
      log("recordTabsRemoved, failed to remove tab", tabId, ", tab not found in open tab list ", tabs);
    }
  }
  if (callback) {
    callback();
  }
}

/**
 * switch tabs but before doing so set the global variable 'skipTabOrderUpdateTimer' to the tab id being selected, this
 * will then be tested in the updateTabOrder() function
 */
function switchTabsWithoutDelay(tabid) {
  skipTabOrderUpdateTimer = tabid;
  switchTabs(tabid)
}

function switchTabs(tabid) {
  // find the tab
  chrome.tabs.get(tabid, function(tab) {
    // Focus the window before the tab to fix issue #273
    chrome.windows.update(tab.windowId, {focused: true}, function() {
      // focus the tab
      chrome.tabs.update(tabid, {active: true}, function(tab) {
        // // move the tab if required
        log("switched tabs", tabid, tab);
        if (moveOnPopupSwitchOnly()) {
          moveTab(tab);
        }
      });
    });
  });
}

/**
 * collect all of the bookmarks as a simple flat array.
 */
function traverseTree(treeNode) {
  function loop(node, result) {
    if (node.url) {
      result.push(node);
    } else if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        var item = node.children[i];
        loop(item, result);
      }
    }
    return result;
  }

  return loop(treeNode, []);
}

function allBookmarks(callback) {
  chrome.bookmarks.getTree(function(tree) {
    bookmarks = traverseTree(tree[0]);
    callback(bookmarks);
  })
}

function setupBookmarks() {
  allBookmarks(function(result) {
    bookmarks = result;
  });
}

function init() {

  // reset the extension state
  tabs = [];
  closedTabs = [];
  bookmarks = [];

  // init the badge text
  initBadgeIcon();

  // count and record all the open tabs for all the windows
  chrome.windows.getAll({populate: true}, function(windows) {

    for (var i = 0; i < windows.length; i++) {
      var t = windows[i].tabs;

      for (var j = 0; j < t.length; j++) {
        recordTab(t[j]);
      }

      updateBadgeText();
    }

    // set the current tab as the first item in the tab list
    chrome.tabs.query({currentWindow: true, active: true}, function(tabArray) {
      log('initial selected tab', tabArray);
      updateTabsOrder(tabArray);
    });
  });

  // attach an event handler to capture tabs as they are closed
  chrome.tabs.onRemoved.addListener(function(tabId) {
    recordTabsRemoved([tabId], null);
    if (getJumpToLatestTabOnClose()) {
      switchTabs(tabs[activeTabsIndex].id); // jump to latest = tabs[0]
    }
  });

  // attach an event handler to capture tabs as they are opened
  chrome.tabs.onCreated.addListener(function(tab) {
    if (!includeTab(tab)) {
      return;
    }
    //      log('created tab', tab, 'selected tab is ', t2);

    // remove the tab from the closed tab list if present
    var idx = indexOfTabByUrl(closedTabs, tab.url);
    if (idx >= 0) {
      closedTabs.splice(idx, 1);
    }

    // add foreground tabs first in list and background tabs to end
    if (tab.active) {
      tabs.unshift(tab);
      updateTabOrder(tab.id); // change tab order only for tabs opened in foreground, hence were focused
      if (!moveOnPopupSwitchOnly()) {
        moveTab(tab);
      }
    } else {
      tabs.push(tab);
    }
    updateBadgeText();
  });

  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
//    log('onUpdated tab', tab.id, tabId);
    tabs[indexOfTab(tabId)] = tab;
    updateBadgeText();
  });

  chrome.tabs.onActivated.addListener(function(info) {
//    log('onActivated tab', info.tabId);
    updateTabOrder(info.tabId);
  });

  chrome.tabs.onReplaced.addListener(function(addedTabId, removedTabId) {
    // log('onReplaced', 'addedTabId:', addedTabId, 'removedTabId:', removedTabId);
    chrome.tabs.get(addedTabId, function(tab) {
      tabs[indexOfTab(removedTabId)] = tab;
    })
  });

  chrome.windows.onFocusChanged.addListener(function(windowId) {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      chrome.tabs.query({windowId: windowId, active: true}, function(tabArray) {
//        log('onFocusChanged tab', tabArray);
        updateTabsOrder(tabArray);
      });
    }
  });

  chrome.commands.onCommand.addListener(function(command) {
    //log('Command:', command);

    if (popupMessagePort) { // shortcut triggered from inside popup
      if (command === "quick-prev-tab") {
        popupMessagePort.postMessage({move: "prev"});
      } else if (command === "quick-next-tab") {
        popupMessagePort.postMessage({move: "next"});
      }
    } else { // shortcut triggered anywhere else in Chrome or even Global
      if (tabs.length > 1) {
        if (command === "quick-prev-tab") {
          // Differ between: normal Chrome tab || Global OS-app, chrome windowsTypes: 'popup','devtools'
          chrome.windows.getLastFocused({populate: false, windowTypes: ['normal', 'popup']}, function(window) {
            if (window.focused) {
              // Chrome is currently focused, and more specifically a normal chrome tab
              chrome.tabs.query({active: true, currentWindow: true}, function(t) {
                var activeTab = t[0];
                if (activeTab.id === tabs[activeTabsIndex].id) {
                  switchTabs(tabs[activeTabsIndex + 1].id); // jump to previous = tabs[1]
                  activeTabsIndex++;
                } else {
                  // since the user has some other tab active and not the latest, first jump back to it
                  switchTabs(tabs[activeTabsIndex].id); // jump to latest = tabs[0]
                }
              });
            } else {
              // In focus is a Global OS-app or chrome windowsTypes: 'popup','devtools'
              switchTabs(tabs[activeTabsIndex].id); // jump to latest = tabs[0]
            }
          });
        } else if (command === "quick-next-tab" && activeTabsIndex !== 0) {
          // next can only work if switched already to previous, and hence latest tab isn't selected / activeTabsIndex != 0
          switchTabs(tabs[activeTabsIndex - 1].id);
          activeTabsIndex--;
        }
      }
    }
  });

  chrome.runtime.onConnect.addListener(function(port) {
    if (port.name === "qtPopup") {
      //log("popup opened!");
      popupMessagePort = port;
      if (tabOrderUpdateFunction) {
        tabOrderUpdateFunction.call();
      }
      popupMessagePort.onDisconnect.addListener(function(msg) {
        //log("popup closed!", msg);
        popupMessagePort = null;
      });
    }
  });

  chrome.bookmarks.onCreated.addListener(function() {setupBookmarks()});
  chrome.bookmarks.onRemoved.addListener(function() {setupBookmarks()});
  chrome.bookmarks.onChanged.addListener(function() {setupBookmarks()});
  chrome.bookmarks.onMoved.addListener(function() {setupBookmarks()});

  setupBookmarks();
}

init();


/**
 * Command action functions
 * =============================================================================================================================================================
 *
 * Some action functionality requires that the logic execute outside of the popup in order to reliably complete.
 */

function splitTabs(tabsToInclude) {
  let head = tabsToInclude[0];
  let tail = tabsToInclude.slice(1);
  chrome.windows.create({
    // create a window
    tabId: head,
    type: "normal",
    focused: true,
  }, function(window) {
    chrome.tabs.move(tail, {
      windowId: window.id,
      index: -1
    });
  });
}

