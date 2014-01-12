/*
Copyright (c) 2009 - 2014, Evan Jehu
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

var tabs = [];

var closedTabs = [];

var lastWindow = null;

var re = /^https?:\/\/.*/;
function isWebUrl(url) {
  return re.exec(url);
}

function log(src, msg) {
  console.log(src, msg);
}


function ShortcutKey(properties) {
  this.ctrl = properties.ctrl || false;
  this.shift = properties.shift || false;
  this.alt = properties.alt || false;
  this.meta = properties.meta || false;
  this.key = properties.key || '';
}
ShortcutKey.prototype.pattern = function() {
  return (this.alt ? "alt+" : "")
          + (this.meta ? "command+" : "")
          + (this.ctrl ? "ctrl+" : "")
          + (this.shift ? "shift+" : "")
          + (this.key);
};


function getClosedTabsSize() {
  var s = localStorage["closed_tabs_size"];
  return s ? parseInt(s, 10) || 0 : 10;
}

function setClosedTabsSize(val) {
  localStorage["closed_tabs_size"] = val;
  resizeClosedTabs();
}

function showDevTools() {
  var s = localStorage["include_dev_tools"];
  return s ? s == 'true' : false;
}

function setShowDevTools(val) {
  localStorage["include_dev_tools"] = val;
}

function showUrls() {
  var s = localStorage["show_urls"];
  return s ? s == 'true' : true;
}

function setShowUrls(val) {
  localStorage["show_urls"] = val;
}

function showTooltips() {
  var s = localStorage["show_tooltips"];
  return s ? s == 'true' : true;
}

function setShowTooltips(val) {
  localStorage["show_tooltips"] = val;
}

function showFavicons() {
  var s = localStorage["show_favicons"];
  return s ? s == 'true' : true;
}

function setShowFavicons(val) {
  localStorage["show_favicons"] = val;
}

function getSearchString() {
  return localStorage["search_string"] || 'http://www.google.com/search?q=%s';
}

function setSearchString(val) {
  localStorage["search_string"] = val;
}

function getShortcutKey() {
  return getKeyCombo("key_popup", "");
}
function clearOldShortcutKey() {
  localStorage["key_popup"] = null
}

function includeTab(tab) {
  return !(!showDevTools() && /chrome-devtools:\/\//.exec(tab.url));
}

function getKeyCombo(savedAs, def) {
  var key = null;
  if(localStorage[savedAs]) {
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
  return getKeyCombo("close_tab_popup", {ctrl:true, key:"d"});
}

function setCloseTabKey(key) {
  return setKeyCombo("close_tab_popup", key);
}

function getCloseAllTabsKey() {
  return getKeyCombo("close_all_tabs_popup", {ctrl:true, shift:true, key:"d"});
}

function setCloseAllTabsKey(key) {
  return setKeyCombo("close_all_tabs_popup", key);
}

function resizeClosedTabs() {
  closedTabs.splice(getClosedTabsSize());
}

function addClosedTab(tab) {
  if(isWebUrl(tab.url)) {
    console.log("adding tab " + tab.id + " to closedTabs array " + tab.url);
    closedTabs.unshift({url:tab.url, title:tab.title, favIconUrl:tab.favIconUrl});
  }
  resizeClosedTabs();
}

/**
 * search the global tabs array for a tab with the given tabId and return its index, -1 if not found
 *
 * @param tabId
 */
function indexOfTab(tabId) {
  for(var i = 0; i < tabs.length; i++) {
    if(tabId === tabs[i].id) {
      return i;
    }
  }
  return -1;
}

function indexOfTabByUrl(tabArray, url) {
  for(var i = 0; i < tabArray.length; i++) {
    if(url === tabArray[i].url) {
      return i;
    }
  }
  return -1;
}

function initBadgeIcon() {
  // set the badge colour
  chrome.browserAction.setBadgeBackgroundColor({color:[32, 7, 114, 255]});
  updateBadgeText(0);
}

/**
 * change the number of open tabs displayed on the extensions badge/icon
 *
 * @param val - the new value for the badge
 */
function updateBadgeText(val) {
  chrome.browserAction.setBadgeText({text:val + ""});
}

/**
 * move the tab with tabId to the top of the global tabs array
 *
 * @param tabId
 */
function updateTabOrder(tabId) {
  var idx = indexOfTab(tabId);
  if(idx >= 0) {
    var tab = tabs[idx];
    tabs.splice(idx, 1);
    tabs.unshift(tab);
  }
}

/**
 * for some reason in the latest versions of Chrome the tag removed event is not always propagating to
 * Quick Tabs so rather than leaving the count all messed up use this method to correct for any errors.
 *
 * Since I cannot reproduce the issue with any consistency I will leave this nasty little patch here until more
 * light gets shed on it.
 *
 * @param removeNotFound - if true remove any missing tabs otherwise just log them
 *
 */
function checkOpenTabs(removeNotFound) {
  chrome.tabs.query({}, function (openTabs) {

    if (openTabs.length == tabs.length) {
      return;
    }

    var currentTabs = {};
    var tabsToRemove = [];
    for (var i = 0; i < openTabs.length; i++) {
      currentTabs[openTabs[i].id] = true;
    }

    if (!removeNotFound) {
      console.log("currentTabs", currentTabs);
      console.log("scanning tabs", tabs);
      console.log("tabsToRemove", tabsToRemove);
    }

    for (var j = 0; j < tabs.length; j++) {
      if (!currentTabs[tabs[j].id]) {
        console.log("  tab found that is not currently reported as open: ", tabs[j]);
        tabsToRemove.push(tabs[j].id);
      }
    }

    if (tabsToRemove.length > 0) {
      console.log("  removing tab", tabsToRemove);
      if (removeNotFound) {
        recordTabsRemoved(tabsToRemove);
      }
    }
  })
}

function recordTabsRemoved(tabIds, callback) {
  for(var j = 0; j < tabIds.length; j++) {
    var tabId = tabIds[j];
    var idx = indexOfTab(tabId);
    if(idx >= 0) {
      var tab = tabs[idx];
      addClosedTab(tab);
      tabs.splice(idx, 1);
      updateBadgeText(tabs.length);
    } else {
      console.log("recordTabsRemoved, failed to remove tab", tabId ,", tab not found in open tab list ", tabs);
    }
  }
  if(callback) {
    callback();
  }
}

function switchTabs(tabid, callback) {

  chrome.tabs.get(tabid, function(tab) {
    chrome.windows.update(tab.windowId, {focused:true}, function () {
      chrome.tabs.update(tab.id, {selected:true});
      if(callback) {
        callback();
      }
    });
  });
}

function init() {

  // reset the extension state
  tabs = [];
  closedTabs = [];
  lastWindow = null;

  // init the badge text
  initBadgeIcon();

  // count and record all the open tabs for all the windows
  chrome.windows.getAll({populate:true}, function (windows) {
    for(var i = 0; i < windows.length; i++) {
      var t = windows[i].tabs;
      for(var j = 0; j < t.length; j++) {
        if(includeTab(t[j])) {
          tabs.push(t[j]);
        }
      }
      updateBadgeText(tabs.length);
    }

    // set the current tab as the first item in the tab list
      // todo getSelected has been deprecated, replace with chrome.tabs.query
    chrome.tabs.getSelected(null, function(tab) {
      updateTabOrder(tab.id);
    });
  });

  // attach an event handler to capture tabs as they are closed
  chrome.tabs.onRemoved.addListener(function(tabId) {
    recordTabsRemoved([tabId], null);
  });

  // attach an event handler to capture tabs as they are opened
  chrome.tabs.onCreated.addListener(function(tab) {
    // todo getSelected has been deprecated, replace with chrome.tabs.query
    chrome.tabs.getSelected(null, function(t2) {
      if(!includeTab(tab)) {
        return;
      }
//      console.log('created tab', tab, 'selected tab is ', t2);

      // remove the tab from the closed tab list if present
      var idx = indexOfTabByUrl(closedTabs, tab.url);
      if(idx >= 0) {
        closedTabs.splice(idx, 1);
      }

      tabs.unshift(tab);
      updateBadgeText(tabs.length);
      if (t2) {
        updateTabOrder(t2.id);
      }
    });
  });

  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    tabs[indexOfTab(tabId)] = tab;
  });

  chrome.tabs.onSelectionChanged.addListener(function (tabId) {
    updateTabOrder(tabId);
  });

  chrome.windows.onFocusChanged.addListener(function(windowId) {
    if (windowId >= 0) {
      // todo getSelected has been deprecated, replace with chrome.tabs.query
      chrome.tabs.getSelected(windowId, function (tab) {
        if (tab) {
          updateTabOrder(tab.id);
        }
      });
    }
  });
}

init();
