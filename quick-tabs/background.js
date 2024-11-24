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

'use strict';

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

var debugBadgeColor = {color: [255, 0, 0, 255]};

/**
 * badge text color while the tab order update timer is active
 */
var tabTimerBadgeColor = {color: [255, 106, 0, 255]};

var debug = false;

var re = /^https?:\/\/.*/;

function isWebUrl(url) {
  return re.exec(url);
}

/**
 * Simple log wrapper to centralise logging for all of the code, called from popup.js as bg.log(....)
 */
function log() {
  if (Config.get(DEBUG)) {
    console.log((new Date).toISOString(), ...arguments);
  }
}

/**
 * set the debug switch, this can be called from the background page JavaScript console
 * to enable/disable logging, this setting is saved to local storage.  To
 * enable logging temporarily type debug=true in the background page JS console.
 */
function setDebug(val) {
  debug = val;
  Config.set(DEBUG, val);
}

/**
 * see https://github.com/babyman/quick-tabs-chrome-extension/issues/90
 *
 * @returns {number} delay in ms a tab must be in focus before it is moved to the top of the open tabs list
 */
function getTabOrderUpdateDelay() {
  let s = Config.get(TAB_ORDER_UPDATE_DELAY);
  if(s === "0") {
    return 0;
  }
  return s ? parseInt(s, 10) || 1500 : 1500;
}

function resizeClosedTabs() {
  closedTabs.splice(Config.get(CLOSED_TABS_SIZE));
}

function removeClosedTab(url) {
  var idx = indexOfTabByUrl(closedTabs, url);
  if (idx >= 0) {
    closedTabs.splice(idx, 1);
    saveClosedTabs();
  }
}

function addClosedTab(tab) {
  if (isWebUrl(tab.url)) {
    //    log("adding tab " + tab.id + " to closedTabs array " + tab.url);
    closedTabs.unshift({url: tab.url, title: tab.title, favIconUrl: tab.favIconUrl});
    saveClosedTabs();
  }
  resizeClosedTabs();
}

function saveClosedTabs() {
  if (Config.get(CLOSED_TABS_LIST_SAVE)) {
    // save closedTabs after a delay to avoid saving all tabs on browser exit
    setTimeout(function () {
      Config.set(CLOSED_TABS, JSON.stringify(closedTabs));
    }, 10000);
  }
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
  chrome.action.setBadgeBackgroundColor(debug ? debugBadgeColor : badgeColor);
  updateBadgeText();
}

/**
 * update the number of open tabs displayed on the extensions badge/icon
 */
function updateBadgeText() {
  if (Config.get(SHOW_TAB_COUNT)) {
    var val = tabs.filter(tab => Utils.validTab(tab) && Utils.includeTab(tab)).length;

    chrome.action.setBadgeText({text: val + ""});
  } else {
    chrome.action.setBadgeText({text: ""});
  }
}

/**
 * Avoid saving tabs order to local storage with a debounce of 60 seconds.
 */
var debouncedSaveTabsOrder = Utils.debounce(saveTabsOrder, 10_000);

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
  chrome.action.setBadgeBackgroundColor(tabTimerBadgeColor);

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
      if (!Config.get(MOVE_ON_POPUP_SWITCH_ONLY)) {
        moveTab(tab)
      }
    }
    // reset the badge color
    chrome.action.setBadgeBackgroundColor(debug ? debugBadgeColor : badgeColor);
    tabOrderUpdateFunction.cancel(); // #note big bug. Function was never canceled and hence tabOrderUpdateFunction always true
  }, tabId === skipTabOrderUpdateTimer ? 0 : getTabOrderUpdateDelay());

  // clear the skip var
  skipTabOrderUpdateTimer = null;

  debouncedSaveTabsOrder();
}

/**
 * Save tabs order to local storage to be able to restore it after browser or SW restart (could even happen after sleep/hibernate)
 */
function saveTabsOrder() {
  const tabUrls = tabs.map(tab => tab.url);
  Config.set(TABS_ORDER, tabUrls);
}

/**
 * Sort tabs[] in place based on the order saved by saveTabsOrder()
 */
function restoreTabsOrder() {
  const tabUrls = Config.get(TABS_ORDER);
  if (!tabUrls?.length || !tabs.length) return;

  const tabOrder = {};
  for (let i = tabUrls.length - 1; i >= 0; i--) {
    tabOrder[tabUrls[i]] = i+1;
  }

  tabs.sort((a, b) => (tabOrder[a.url] || Number.MAX_VALUE) - (tabOrder[b.url] || Number.MAX_VALUE));
}

/**
 * if the user has setup tab moving apply it here.
 * Move left is prioritised over move right.
 *
 * @param tab
 */
function moveTab(tab) {
  if(!tab.pinned) {
    if (Config.get(MOVE_LEFT_ON_SWITCH)) {
      log("moving tab to the left", tab.id);
      chrome.tabs.move(tab.id, {index: 0});
    } else if (Config.get(MOVE_ON_SWITCH)) {
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
  if (Utils.includeTab(tab)) {
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
        if (Config.get(MOVE_ON_POPUP_SWITCH_ONLY)) {
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

function getTabs() {
  return tabs;
}

function getClosedTabs() {
  return closedTabs;
}

function getBookmarks() {
  return bookmarks;
}

async function reloadConfig() {
  await Config.init();
  updateBadgeText();
  resizeClosedTabs();
}

async function init() {

  // This block can be removed in the future, when all users have updated to the current version.
  // We need to open a page to copy data from localStorage (not accesible from SW) to chrome.storage.local.
  // We could use 'chrome.action.openPopup' or Offscreen API, but it's better to use 'chrome.tabs.create'
  // for backward compability with previous Chrome versions and other Chromium browsers.
  if (!Config.get(INSTALLED_AT)) {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (msg.firstRun) {
        chrome.tabs.remove(sender.tab.id);
        Config.init().then(init);
      }
    });
    chrome.tabs.create({ url: "popup.html?firstRun=true", active: false });
    return;
  }

  debug = Config.get(DEBUG);

  // reset the extension state
  tabs = [];
  closedTabs = [];
  bookmarks = [];

  // init the badge text
  initBadgeIcon();

  // count and record all the open tabs for all the windows
  const windows = await chrome.windows.getAll({ populate: true });
  for (var i = 0; i < windows.length; i++) {
    var t = windows[i].tabs;

    for (var j = 0; j < t.length; j++) {
      recordTab(t[j]);
    }
  }

  updateBadgeText();
  restoreTabsOrder();

  // set the current tab as the first item in the tab list
  const tabArray = await chrome.tabs.query({ currentWindow: true, active: true });
  log('initial selected tab', tabArray);
  updateTabsOrder(tabArray);

  // attach an event handler to capture tabs as they are closed
  chrome.tabs.onRemoved.addListener(function(tabId) {
    recordTabsRemoved([tabId], null);
    if (Config.get(JUMP_TO_LATEST_TAB_ON_CLOSE)) {
      switchTabs(tabs[activeTabsIndex].id); // jump to latest = tabs[0]
    }
  });

  // attach an event handler to capture tabs as they are opened
  chrome.tabs.onCreated.addListener(function(tab) {
    if (!Utils.includeTab(tab)) {
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
      if (!Config.get(MOVE_ON_POPUP_SWITCH_ONLY)) {
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
        popupMessagePort.postMessage({cmd: "prev"});
      } else if (command === "quick-next-tab") {
        popupMessagePort.postMessage({cmd: "next"});
      } else if (command === "quick-duplicate-tab") {
        popupMessagePort.postMessage({cmd: "duplicate"});
      }
    } else { // shortcut triggered anywhere else in Chrome or even Global
      if (tabs.length > 1) {
        if (command === "quick-prev-tab") {
          // Differ between: normal Chrome tab || Global OS-app, chrome windowsTypes: 'popup','devtools'
          chrome.windows.getLastFocused({populate: false, windowTypes: ['normal', 'popup']}, function(window) {
            // Chrome is currently focused, and more specifically a normal chrome tab
            chrome.tabs.query({active: true, currentWindow: true}, function(t) {
              var activeTab = t[0];
              if (activeTab && activeTab.id === tabs[activeTabsIndex].id) {
                switchTabs(tabs[activeTabsIndex + 1].id); // jump to previous = tabs[1]
                activeTabsIndex++;
              } else {
                // since the user has some other tab active and not the latest, first jump back to it
                switchTabs(tabs[activeTabsIndex].id); // jump to latest = tabs[0]
              }
            });
          });
        } else if (command === "quick-next-tab" && activeTabsIndex !== 0) {
          // next can only work if switched already to previous, and hence latest tab isn't selected / activeTabsIndex != 0
          switchTabs(tabs[activeTabsIndex - 1].id);
          activeTabsIndex--;
        } else if (command === "quick-duplicate-tab") {
          chrome.tabs.query({active: true, currentWindow: true}, function(t) {
            if(t.length > 0) {
              chrome.tabs.duplicate(t[0].id);
            }
          });
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

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.call) {
      if (typeof self[msg.call] === 'function') {
        sendResponse(self[msg.call](msg.arg));
      } else {
        sendResponse({});
      }
    }
  });

  if (Config.get(CLOSED_TABS_LIST_SAVE)) {
    closedTabs = JSON.parse(Config.get(CLOSED_TABS) || '[]');
  }

  // keep the service worker alive, perhaps not a beautifull solution,
  // but that's better than a constantly restarting service worker
  setInterval(chrome.runtime.getPlatformInfo, 25_000);
}

if (self.Config) {
  init();
}

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
