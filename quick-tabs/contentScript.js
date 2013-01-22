/*
 Copyright (c) 2009 - 2012, Evan Jehu
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

var SCRIPT_VERSION = 0.5;
var popup = "";

function popup_params(width, height) {
  var screenX = window.screenX;
  var screenY = window.screenY;
  var windowWidth = window.outerWidth;
  var windowHeight = window.outerHeight;
  var h = (screenX < 0) ? window.screen.width + screenX : screenX;
  var left = parseInt(h + ((windowWidth - width) / 2), 10);
  var top = parseInt(screenY + ((windowHeight - height) / 2.5), 10);
  return 'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + ',scrollbars=1,location=1,toolbar=1';
}

function showPopup() {
  chrome.extension.sendMessage({call: "openQuickTabs"}, function (response) {
//    console.log("call to open Quick Tabs popup, response:", response);
    var url = chrome.extension.getURL('popup.html');
    window.open(url, "Quick Tabs", popup_params(350, 550));
  });
}

function bindShortcut(pattern) {
  if (pattern != popup) {
    if (popup != "") {
      // console.log("unbinding quick tabs shortcut key from " + popup);
      $(document).unbind('keydown', showPopup);
    }
    if (pattern != "") {
      // console.log("binding quick tabs shortcut key to " + pattern);
      $(document).bind('keydown', pattern, showPopup);
    }
    popup = pattern;
  }
}

function rebindAll() {
  chrome.extension.sendMessage({call: "shortcuts"}, function (response) {
    bindShortcut(response.popup);
  });
}

chrome.extension.onMessage.addListener(
    function (request, sender, sendResponse) {
      if (request.call == "poll") {
        sendResponse({tabid: request.tabid, version: SCRIPT_VERSION});
      } else if (request.call == "rebind") {
        rebindAll();
        sendResponse({});
      } else {
        // always respond with something
        sendResponse({});
      }
    });


// rebind keys on load
rebindAll();
