/*
 Copyright (c) 2009 - 2010, Evan Jehu
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

var SCRIPT_VERSION = 0.3;
var popup = "";

function showPopup() {
  chrome.extension.sendRequest({call: "openQuickTabs"}, function(response) {
//    console.log("call to open Quick Tabs popup, success:" + response.success);
  });
}

function bindShortcut(pattern) {
  if(pattern != popup) {
//    console.log("binding quick tabs shortcut key to " + pattern);
    $(document).unbind('keydown', popup, showPopup);
    $(document).bind('keydown', pattern, showPopup);
    popup = pattern;
  }
}

function rebindAll() {
  chrome.extension.sendRequest({call: "shortcuts"}, function(response) {
    bindShortcut(response.popup);
  });
}

chrome.extension.onRequest.addListener(
        function(request, sender, sendResponse) {
          if(request.call == "poll") {
            sendResponse({tabid:request.tabid, version:SCRIPT_VERSION});
          } else if(request.call == "rebind") {
            rebindAll();
            sendResponse({});
          } else {
            // always respond with something
            sendResponse({});
          }
        });


// rebind keys on load
rebindAll();
