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

bg = chrome.extension.getBackgroundPage();

function tabImage(tab) {
  if(tab.favIconUrl && tab.favIconUrl.length > 0) {
    return tab.favIconUrl;
  } else if(/^chrome:\/\/extensions\/.*/.exec(tab.url)) {
    return "/assets/chrome-extensions-icon.png";
  } else {
    return "/assets/blank.png"
  }
}

function switchTabs(tabid) {

  chrome.tabs.get(tabid, function(tab) {
    chrome.windows.getCurrent(function(w) {
      var wid = bg.lastWindow;
      if(!wid) {
        wid = w.id;
      }
      if(wid != tab.windowId) {
        chrome.tabs.move(tab.id, {windowId:wid, index:1000}, function(t2) {
          chrome.tabs.update(tab.id, {selected:true});
          tab.windowId = t2.windowId;
          window.close();
        });
      } else {
        chrome.tabs.update(tab.id, {selected:true});
        window.close();
      }
    });
  });
}

function openInNewTab(tab) {
  chrome.tabs.create({url:tab.url, index:1000});
  window.close();
}

function closeTabs(tabIds) {
  bg.recordTabsRemoved(tabIds, function() {
    for(var x = 0; x < tabIds.length; x++) {
      var tabId = tabIds[x];
      chrome.tabs.remove(tabId);
      $("#" + tabId).fadeOut("fast").remove();
    }
    $("tr.closed").remove();
    drawClosedTabs();
  })
}

function drawCurrentTabs() {
  // find the available tabs
  var tabs = bg.tabs;
  var urlStyle = "display:" + (bg.showUrls() ? "block" : "none");
  // draw the current tabs
  $.each(tabs, function(i, tab) {
    if(i > 0) {
      $("#template").append($("<tr></tr>")
              .attr({class:"tab open", id:tab.id, window:tab.windowId})
              .append($("<td width='16'></td>").append($("<img></img>").attr({class:"tabimage", src:tabImage(tab), width:"16", height:"16", border:"0"})))
              .append($("<td></td>").append($("<div class='title hilite'></div>").attr({title:tab.title}).text(tab.title))
              .append($("<div class='url hilite'></div>").attr("style", urlStyle).text(tab.url)))
              .click(function() {
        switchTabs(tab.id);
      }).mouseover(function () {
        $(".tab.withfocus").removeClass('withfocus');
        $(this).addClass('withfocus');
      }));
    }
  });
}

function drawClosedTabs() {
  var closedTabs = bg.closedTabs;
  var urlStyle = "display:" + (bg.showUrls() ? "block" : "none");
  $.each(closedTabs, function(i, tab) {
    $("#template").append($("<tr></tr>")
            .attr({class:"tab closed"})
            .append($("<td width='16'></td>").append($("<img></img>").attr({class:"tabimage", src:tabImage(tab), width:"16", height:"16", border:"0"})))
            .append($("<td></td>").append($("<div class='title hilite'></div>").attr({title:tab.title}).text(tab.title))
            .append($("<div class='url hilite'></div>").attr("style", urlStyle).text(tab.url)))
            .click(function() {
      // create a new tab for the window
      openInNewTab(tab);
      // remove the tab from the closed tabs list
      closedTabs.splice(i, 1);
    }).mouseover(function () {
      $(".tab.withfocus").removeClass('withfocus');
      $(this).addClass('withfocus');
    }));
  });
}

$(document).ready(function() {

  if(bg.lastWindow) {
    $('link[rel=stylesheet]:last')
            .after($("link[rel=stylesheet]:last").clone().attr({href : "assets/styles-popup-window.css"}));
  }

  // clear the tab table
  $("#template").empty();

  drawCurrentTabs();

  drawClosedTabs();

  // show the tab table once it has been completed
  $("#template").show();

  // set focus on the first item
  $(".tab:visible:first").addClass("withfocus");

  $('table#template .tab').quicksearch({
    position: 'prepend',
    attached: 'div#tools',
    focusOnLoad: true,
    loaderText: '',
    labelText: '',
    fixWidths: true,
    stripeRowClass: ['odd', 'even'],
    delay:500,
    onAfter: function() {
      // update the highlighting
      var str = $("input[type=text]").val();
      $(".hilite").removeHighlight();
      if(str.length > 0) {
        $(".hilite").highlight(str);
      }
      // update the selected item
      $(".tab.withfocus").removeClass("withfocus");
      $(".tab:visible:first").addClass("withfocus");
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
    $(".tab.withfocus:visible").removeClass('withfocus').prevAll(":visible").eq(0).addClass('withfocus');
    if($(".tab.withfocus:visible").length == 0) {
      $(".tab:visible:first").addClass("withfocus");
    }
  });

  $(document).bind('keydown', 'down', function() {
    $(".tab.withfocus:visible").removeClass('withfocus').nextAll(":visible").eq(0).addClass('withfocus');
    if($(".tab.withfocus:visible").length == 0) {
      $(".tab:visible:last").addClass("withfocus");
    }
  });

  $(document).bind('keydown', 'return', function() {
    if($(".tab.withfocus:visible").length == 0) {
      $(".tab:visible:first").addClass("withfocus");
    }
    $(".tab.withfocus:visible").trigger("click");
  });

  $(document).bind('keydown', bg.getCloseTabKey().pattern(), function() {
    if($(".tab.withfocus:visible").length == 0) {
      $(".tab:visible:first").addClass("withfocus");
    }
    var attr = $('.tab.withfocus:visible').attr('id');
    if(attr) {
      var tabId = parseInt(attr);
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
    window.close();
  });

  $(window).unload(function () {
    bg.lastWindow = null;
  });

});
