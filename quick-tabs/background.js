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
 * arrays to hold the current order of the tabs and bookmarks
 */
var tabs = [];
var bookmarks = [];

/**
 * tabs[index] of tab that's currently active/focused
 */
var activeTabsIndex = 0;

/**
 * TabId of the actually active tab
 * Can be different from tabId of activeTabsIndex if tabs order is not updated yet
 */
var activeTabId = 0;

/**
 * Tab groups collapsed state, is needed for COLLAPSE_OTHER_TAB_GROUPS functionality
 */
var tabGroupCollapsed = {};

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

/**
 * Id of the last window and tab that was audible, used for the quick-switch-audible command
 */
var lastAudibleTabId = null;

var debug = false;

var re = /^https?:\/\/.*/;

function isWebUrl(url) {
  return re.exec(url);
}

/**
 * Simple log wrapper to centralise logging for all of the code, called from popup.js as bg.log(....)
 */
function log(...args) {
  if (Config.get(DEBUG)) {
    console.log((new Date).toISOString(), ...args);
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
  if (Config.get(SHOW_TAB_COUNT) && tabs.length > 0) {
    var tabsCount = tabs.reduce((count, tab) => Utils.validTab(tab) ? count + 1 : count, 0);

    chrome.action.setBadgeText({text: tabsCount + ""});
  } else {
    chrome.action.setBadgeText({text: ""});
  }
}

/**
 * Avoid saving tabs order to local storage too often
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
      moveTab(tab)
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
 * if the user has setup tab moving apply it here.
 * Move left is prioritised over move right.
 *
 * @param tab
 * @param fromPopup whether the tab move was triggered from the popup
 */
async function moveTab(tab, fromPopup = false) {
  if (tab.pinned || (Config.get(MOVE_ON_POPUP_SWITCH_ONLY) && !fromPopup)) return;

  let index = Config.get(MOVE_LEFT_ON_SWITCH) ? 0 :
                Config.get(MOVE_ON_SWITCH) ? -1 : null;
  if (index == null) return;

  if (Utils.IS_FIREFOX && index === 0) {
    // Firefox requires index to be bigger than index of the last pinned tab
    const tabsInWindow = await chrome.tabs.query({ windowId: tab.windowId });
    const firstUpinned = tabsInWindow.find(t => !t.pinned);
    index = firstUpinned?.index || 0;
  }

  await chrome.tabs.move(tab.id, { index });
  // keep within the tab group
  if (tab.groupId > 0) {
    await chrome.tabs.group({ groupId: tab.groupId, tabIds: tab.id });
  }
}

function updateTabsOrder(tabArray) {
  for (var j = tabArray.length - 1; j >= 0; j--) {
    updateTabOrder(tabArray[j].id)
  }
}

function recordTab(tab) {
  log('recording tab', tab.id);
  Utils.extractSuspendedUrl(tab);
  tabs.push(tab);
}

function recordTabsRemoved(tabIds, callback) {
  for (var j = 0; j < tabIds.length; j++) {
    var tabId = tabIds[j];
    var idx = indexOfTab(tabId);
    if (idx >= 0) {
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
function switchTabsWithoutDelay(tabId) {
  skipTabOrderUpdateTimer = tabId;
  switchTabs(tabId)
}

async function switchTabs(tabId, focusWindow = true) {
  // find the tab
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch(e) {}

  if (!tab || (tab.active && !focusWindow)) {
    return; // no tab or the tab and window are already active
  }

  if (focusWindow) {
    // Focus the window before the tab to fix issue #273
    await chrome.windows.update(tab.windowId, { focused: true });
  }

  // focus the tab
  tab = await chrome.tabs.update(tab.id, { active: true });

  // move the tab if required
  log("switched tabs", tab.id, tab);
  moveTab(tab, true);
}

/**
 * collect all of the bookmarks as a simple flat array.
 */
function traverseTree(treeNode) {
  function loop(node, result) {
    if (node.url) {
      Utils.extractSuspendedUrl(node);
      result.push(node);
    } else if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        var item = node.children[i];
        if (node.title && Number(node.parentId)) item.title = node.title + " / " + item.title;
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

function getBookmarks() {
  return bookmarks;
}

async function reloadConfig() {
  await Config.init();
  updateBadgeText();
}

async function init() {
  await Config.init();
  debug = Config.get(DEBUG);

  // reset the extension state
  tabs = [];
  bookmarks = [];

  // count and record all the open tabs for all the windows
  const windows = await chrome.windows.getAll({ populate: true });
  for (var i = 0; i < windows.length; i++) {
    var t = windows[i].tabs;

    for (var j = 0; j < t.length; j++) {
      recordTab(t[j]);
    }
  }

  initBadgeIcon();
  Utils.restoreTabsOrder(tabs);

  // set the current tab as the first item in the tab list
  const tabArray = await chrome.tabs.query({ currentWindow: true, active: true });
  log('initial selected tab', tabArray);
  updateTabsOrder(tabArray);

  const groups = await chrome.tabGroups?.query({}) || [];
  groups.forEach(group => {
    tabGroupCollapsed[group.id] = group.collapsed;
  });

  // attach an event handler to capture tabs as they are closed
  chrome.tabs.onRemoved.addListener(async function(tabId) {
    log('onRemoved tab', tabId);
    const removedTab = tabs[indexOfTab(tabId)];
    recordTabsRemoved([tabId], null);
    if (tabId === activeTabId && Config.get(JUMP_TO_LATEST_TAB_ON_CLOSE)) {
      let lastTabId = 0;

      if (removedTab?.groupId > 0) {
        // if the closed tab was in a group, jump to the last tab in that group
        const lastTabInGroup = tabs.find((tab, idx) => tab.groupId === removedTab.groupId);
        if (lastTabInGroup) {
          lastTabId = lastTabInGroup.id;
        }
      }

      if (!lastTabId) {
        lastTabId = tabs[activeTabsIndex].id;
      }

      switchTabs(lastTabId, false);
    }
  });

  // attach an event handler to capture tabs as they are opened
  chrome.tabs.onCreated.addListener(function(tab) {
    // move to the right of the active tab
    if (Config.get(NEW_TABS_TO_THE_RIGHT) && tab.openerTabId && !tab.url) {
      chrome.tabs.get(tab.openerTabId, function(opener) {
        if (opener?.windowId !== tab.windowId) return;
        const newIndex = opener.index + 1;
        chrome.tabs.move(tab.id, { index: newIndex });
        // need to repeat the moving to work better in all browsers
        setTimeout(() => chrome.tabs.move(tab.id, { index: newIndex }), 200);

        // if opener is in some group then add new tab to the same group
        if (opener?.groupId && opener.groupId !== -1) {
          chrome.tabs.group({ groupId: opener.groupId, tabIds: tab.id });
        }
      });
    }

    // add foreground tabs first in list and background tabs to end
    if (tab.active) {
      tabs.unshift(tab);
      updateTabOrder(tab.id); // change tab order only for tabs opened in foreground, hence were focused
      moveTab(tab);
    } else {
      tabs.push(tab);
    }
    updateBadgeText();
  });

  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    // log('onUpdated tab', tab.id, tabId);
    if (tab.index < 0) return; // tab is being removed, ignore
    Utils.extractSuspendedUrl(tab);
    tabs[indexOfTab(tabId)] = tab;
    updateBadgeText();

    if (tab.audible) {
      lastAudibleTabId = tab.id;
    }
  });

  chrome.tabs.onActivated.addListener(function(info) {
    // delay to ensure onRemove will get the correct active tab
    log('onActivated tab', info.tabId);
    setTimeout(() => activeTabId = info.tabId, 100);
    updateTabOrder(info.tabId);

    // expand the tab group of the activated tab
    chrome.tabs.get(info.tabId, function(tab) {
      if (tab.groupId > 0) {
        chrome.tabGroups?.update(tab.groupId, { collapsed: false });
      }
    });
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
        // log('onFocusChanged tab', tabArray);
        updateTabsOrder(tabArray);
      });
    }
  });

  initOptionalPermissions();

  chrome.commands.onCommand.addListener(function(command) {
    // log('Command:', command);
    if (popupMessagePort && command.endsWith("-tab")) { // shortcut triggered from inside popup
      if (command === "quick-prev-tab") {
        popupMessagePort.postMessage({cmd: "prev"});
      } else if (command === "quick-next-tab") {
        popupMessagePort.postMessage({cmd: "next"});
      } else if (command === "quick-duplicate-tab") {
        popupMessagePort.postMessage({cmd: "duplicate"});
      }
    } else { // shortcut triggered anywhere else in Chrome or even Global
      if (!tabs.length) return;
      if (command === "quick-switch-audible") {
        chrome.tabs.query({ audible: true }, function (audibleTabs) {
          switchTabs(audibleTabs?.[0]?.id || lastAudibleTabId);
        });
      } else if (command === "quick-prev-tab") {
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
  });

  chrome.runtime.onConnect.addListener(function(port) {
    if (port.name === "qtPopup") {
      log("popup opened!");

      popupMessagePort = port;
      if (tabOrderUpdateFunction) {
        tabOrderUpdateFunction.call();
      }
      popupMessagePort.onDisconnect.addListener(function(msg) {
        log("popup closed!", msg);
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

  // keep the service worker alive, perhaps not a beautiful solution,
  // but that's better than a constantly restarting service worker
  setInterval(chrome.runtime.getPlatformInfo, 25_000);
}

function initOptionalPermissions() {
  chrome.tabGroups?.onUpdated.addListener(function (group) {
    log('onUpdated tab group:', group);
    // if group is activated then collapse all other groups in the same window
    if (Config.get(COLLAPSE_OTHER_TAB_GROUPS) && group.collapsed === false && tabGroupCollapsed[group.id] === true) {
      chrome.tabGroups.query({ windowId: group.windowId }, function (groups) {
        for (var i = 0; i < groups.length; i++) {
          var g = groups[i];
          if (g.id !== group.id && g.collapsed === false) {
            log('collapsing group', g.id, g.color, g.title);
            chrome.tabGroups.update(g.id, { collapsed: true });
          }
        }
      });
    }

    tabGroupCollapsed[group.id] = group.collapsed;
  });
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
