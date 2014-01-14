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

var bg = chrome.extension.getBackgroundPage();
var LOG_SRC = "popup";
var searchStr = "";

// Simple little timer class to help with optimizations
function Timer(src) {
  this.src = src;
  this.start = (new Date).getTime();
  this.last = this.start;
}
Timer.prototype.log = function(id) {
  var now = (new Date).getTime();
  bg.log(this.src, id + " total time " + (now - this.start) + " m/s, delta " + (now - this.last) + " m/s");
  this.last = now;
};

function tabImage(tab) {
  if(tab.favIconUrl && tab.favIconUrl.length > 0) {
    return tab.favIconUrl;
  } else if(/^chrome:\/\/extensions\/.*/.exec(tab.url)) {
    return "/assets/chrome-extensions-icon.png";
  } else {
    return "/assets/blank.png"
  }
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
    drawClosedTabs();
  })
}

function scrollToFocus(offset) {
  $('.content').stop().scrollTo('.withfocus', 100, {offset:{top:offset, left:0}});
}

function focus(elem) {
  $(".tab.withfocus").removeClass('withfocus');
  elem.addClass('withfocus');
}

function tabsWithFocus() {
  return $(".tab.withfocus:visible");
}

function isFocusSet() {
  return tabsWithFocus().length > 0;
}

function focusFirst() {
  return $(".tab:visible:first").addClass("withfocus");
}

function focusLast() {
  return $(".tab:visible:last").addClass("withfocus");
}

function focusPrev() {
  tabsWithFocus().removeClass('withfocus').prevAll(":visible").eq(0).addClass('withfocus');
  if(!isFocusSet()) {
    focusLast();
  }
  scrollToFocus(-56);
}

function focusNext() {
  tabsWithFocus().removeClass('withfocus').nextAll(":visible").eq(0).addClass('withfocus');
  if(!isFocusSet()) {
    focusFirst();
  }
  scrollToFocus(-394);
}

/**
 * draw the current tabs, this method uses document.createElement() to create its elements as this is faster than $('<div/>')
 * (see http://jsperf.com/jquery-vs-createelement/70)
 */
function drawCurrentTabs(template) {
  // find the available tabs
  var tabs = bg.tabs;
  var tips = bg.showTooltips();
  var closeTitle = "close tab (" + bg.getCloseTabKey().pattern() + ")";
  var urlStyle = bg.showUrls() ? "tab open" : "tab open nourl";
  var tabimageStyle = bg.showFavicons() ? "tabimage" : "tabimage hideicon";
  // set the start index, skip the current tab
  var startIndex = 0;
  // draw the current tabs
  $.each(tabs, function(index, tab) {
    if(index > startIndex) {
      template.append($(document.createElement('div')).attr({class:urlStyle + (index==startIndex+1?' withfocus':''), id:tab.id, window:tab.windowId})
              .append($(document.createElement('div')).attr({class:tabimageStyle})
                  .append($(document.createElement('img')).attr({src:tabImage(tab), width:"16", height:"16", border:"0"})))
              .append($(document.createElement('div'))
              .append($(document.createElement('div')).attr({class:'close'})
                  .append($(document.createElement('img')).attr({src:'assets/close.png',title:closeTitle}).click(function() {closeTabs([tab.id])})))
              .append($(document.createElement('div')).attr({class:'title hilite', title:tips?tab.title:''}).text(tab.title))
              .append($(document.createElement('div')).attr({class:'url hilite'}).text(tab.url)))
              .click(function() {
        bg.switchTabs(tab.id, function() {
          window.close();
        });
      }).mouseover(function () {
        focus($(this));
      }));
    }
  });
}

function drawClosedTabs(template) {
  var closedTabs = bg.closedTabs;
  var tips = bg.showTooltips();
  var urlStyle = bg.showUrls() ? "tab closed" : "tab closed nourl";
  var tabimageStyle = bg.showFavicons() ? "tabimage" : "tabimage hideicon";
  $.each(closedTabs, function(i, tab) {
    template.append($(document.createElement('div')).attr({class:urlStyle, id:tab.id, window:tab.windowId})
            .append($(document.createElement('div')).attr({class:tabimageStyle})
                .append($(document.createElement('img')).attr({src:tabImage(tab), width:"16", height:"16", border:"0"})))
            .append($(document.createElement('div'))
            .append($(document.createElement('div')).attr({class:'close'})
                .append($(document.createElement('img')).attr({src:'assets/close.png',title:tab.title}).click(function() {closeTabs([tab.id])})))
            .append($(document.createElement('div')).attr({class:'title hilite', title:tips?tab.title:''}).text(tab.title))
            .append($(document.createElement('div')).attr({class:'url hilite'}).text(tab.url)))
            .click(function() {
      // create a new tab for the window
      openInNewTab(tab.url);
      // remove the tab from the closed tabs list
      closedTabs.splice(i, 1);
    }).mouseover(function () {
      focus($(this));
    }));
  });
}

$(document).ready(function() {

  var timer = new Timer(LOG_SRC);

  // verify that the open tabs list is correct
  bg.checkOpenTabs(true);

  // clear the tab table
  var template = $(".template");
  template.empty();

  drawCurrentTabs(template);

  drawClosedTabs(template);

  // show the tab table once it has been completed
  template.show();

  $('#searchbox').quicksearch('.template .tab', {
    stripeRows: ['odd', 'even'],
    delay:50,
    onAfter: function() {
      if (bg.swallowSpruriousOnAfter) {
        bg.swallowSpruriousOnAfter = false;
        return;
      }
      // update the highlighting
      var str = $("input[type=text]").val();
      // If the search string hasn't changed, the keypress wasn't a character
      // but some form of navigation, so we can stop.
      if (searchStr == str) return;
      searchStr = str;

      var hilite = $(".hilite");
      hilite.removeHighlight();
      if(str.length > 0) {
        hilite.highlight(str);
      }
      // Put the ones with title matches on top, url matches after
      var in_title = $('div.tab:visible:has(.title>.highlight)'),
          in_url = $('div.tab:visible:not(:has(.title>.highlight))');
      if (in_title && in_url) {
        $('div.template').prepend(in_title, in_url);
      }
      // update the selected item
      $(".tab.withfocus").removeClass("withfocus");
      focusFirst();
    }
  });

  $(document).bind('keydown.up', function() {
    focusPrev();
    return false;
  });

  $(document).bind('keydown.ctrl_p', function() {
    bg.swallowSpruriousOnAfter = true;
    focusPrev();
    return false;
  });

  $(document).bind('keydown.down', function() {
    focusNext();
    return false;
  });

  $(document).bind('keydown.ctrl_n', function() {
    bg.swallowSpruriousOnAfter = true;
    focusNext();
    return false;
  });

  $(document).bind('keydown.return', function() {
    if(!isFocusSet()) {
      focusFirst();
    }
    if(isFocusSet()) {
      tabsWithFocus().trigger("click");
    } else {
      var inputText = $("input[type=text]");
      var url = inputText.val();
      if(!/^https?:\/\/.*/.exec(url)) {
        url = "http://" + url;
      }
      bg.log(LOG_SRC, "no tab selected, " + url);
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
    var attr = tabsWithFocus().attr('id');
    if(attr) {
      var tabId = parseInt(attr);
      if ( tabsWithFocus().nextAll("div.open").length == 0 ) {
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

});
