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

var bg = chrome.extension.getBackgroundPage();
var LOG_SRC = "popup";

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
    $(".tab.closed").remove();
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

function drawCurrentTabs() {
  // find the available tabs
  var tabs = bg.tabs;
  var tips = bg.showTooltips();
  var closeTitle = "close tab (" + bg.getCloseTabKey().pattern() + ")";
  var urlStyle = bg.showUrls() ? "tab open" : "tab open nourl";
  var tabimageStyle = bg.showFavicons() ? "tabimage" : "tabimage hideicon";
  // draw the current tabs
  $.each(tabs, function(i, tab) {
    if(i > 0) {
      $(".template").append($("<div></div>")
              .attr({class:urlStyle, id:tab.id, window:tab.windowId})
              .append($("<div></div>").attr({class:tabimageStyle}).append($("<img></img>").attr({src:tabImage(tab), width:"16", height:"16", border:"0"})))
              .append($("<div></div>")
              .append($("<div class='close'></div>").append($("<img src='assets/close.png'>").attr({title:closeTitle}).click(function() {closeTabs([tab.id])})))
              .append($("<div class='title hilite'></div>").attr(tips?{title:tab.title}:{}).text(tab.title))
              .append($("<div class='url hilite'></div>").text(tab.url)))
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

function drawClosedTabs() {
  var closedTabs = bg.closedTabs;
  var tips = bg.showTooltips();
  var urlStyle = bg.showUrls() ? "tab closed" : "tab closed nourl";
  var tabimageStyle = bg.showFavicons() ? "tabimage" : "tabimage hideicon";
  $.each(closedTabs, function(i, tab) {
    $(".template").append($("<div></div>")
            .attr({class:urlStyle, id:tab.id, window:tab.windowId})
            .append($("<div></div>").attr({class:tabimageStyle}).append($("<img></img>").attr({src:tabImage(tab), width:"16", height:"16", border:"0"})))
            .append($("<div></div>")
            .append($("<div class='close'></div>").append($("<img src='assets/close.png'>").attr({title:tab.title}).click(function() {closeTabs([tab.id])})))
            .append($("<div class='title hilite'></div>").attr(tips?{title:tab.title}:{}).text(tab.title))
            .append($("<div class='url hilite'></div>").text(tab.url)))
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

  if(bg.lastWindow) {
    // if we are opening in a browser window add the window stylesheet
    $('link[rel=stylesheet]:last')
            .after($("link[rel=stylesheet]:last").clone().attr({href : "assets/styles-popup-window.css"}));
  }

  // clear the tab table
  $(".template").empty();

  drawCurrentTabs();

  drawClosedTabs();

  // show the tab table once it has been completed
  $(".template").show();

  // set focus on the first item
  focusFirst();

  $('.template .tab').quicksearch({
    position: 'prepend',
    attached: 'div#tools',
    focusOnLoad: true,
    loaderText: '',
    labelText: '',
    fixWidths: true,
    stripeRowClass: ['odd', 'even'],
    delay:500,
    onAfter: function() {
      if (bg.swallowSpruriousOnAfter) {
        bg.swallowSpruriousOnAfter = false;
        return;
      }
      // update the highlighting
      var str = $("input[type=text]").val();
      $(".hilite").removeHighlight();
      if(str.length > 0) {
        $(".hilite").highlight(str);
      }
      // update the selected item
      $(".tab.withfocus").removeClass("withfocus");
      focusFirst();
    }
  });

  $('#reload').click(function() {
    bg.installContentScripts();
    $('#contentScripts').hide("fast");
  });

  $('#skip_reload').click(function() {
    bg.tabsMissingContentScripts = new Array();
    $('#contentScripts').hide("fast");
  });

  if(bg.tabsMissingContentScripts.length > 0) {
    $('#contentScripts').show();
    // adjust the content div size to make sure everything still fits on the popup screen
    var newMax = parseInt($('.content').css('max-height')) - $('#contentScripts').outerHeight(true) - 5;
    $('.content').css('max-height', newMax);
  }

  $(document).bind('keydown', 'up', function() {
    focusPrev();
  });

  $(document).bind('keydown', 'down', function() {
    focusNext();
  });

  $(document).bind('keydown', 'return', function() {
    if(!isFocusSet()) {
      focusFirst();
    }
    if(isFocusSet()) {
      tabsWithFocus().trigger("click");
    } else {
      var url = $("input[type=text]").val();
      if(!/^https?:\/\/.*/.exec(url)) {
        url = "http://" + url;
      }
      bg.log(LOG_SRC, "no tab selected, " + url);
      if(/^(http|https|ftp):\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(:[a-zA-Z0-9]*)?\/?([a-zA-Z0-9\-\._\?,'/\\\+&amp;%$#=~])*$/.exec(url)) {
        chrome.tabs.create({url:url});
      } else {
        url = "http://www.google.ca/search?q=" + encodeURI($("input[type=text]").val());
        chrome.tabs.create({url:url});
      }
    }
  });

  $(document).bind('keydown', bg.getCloseTabKey().pattern(), function() {
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
  });

  $(document).bind('keydown', bg.getCloseAllTabsKey().pattern(), function() {
    var tabids = new Array();
    $('.tab.open:visible').each(function () {
      tabids.push(parseInt($(this).attr('id')));
    });
    closeTabs(tabids);
  });

  $(document).bind('keydown', 'esc', function() {
    window.close();
  });

  $(window).blur(function() {
    if (bg.lastWindow) {
      // if this is a spawned window close it on loss of focus
      window.close();
    }
  });

  $(window).unload(function () {
    bg.lastWindow = null;
  });

});
