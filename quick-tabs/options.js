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
function displayKey(prefix, key) {
  $('#' + prefix + '_key').val(key.key);
  $('#' + prefix + '_ctrl').attr('checked', key.ctrl);
  $('#' + prefix + '_shift').attr('checked', key.shift);
  $('#' + prefix + '_alt').attr('checked', key.alt);
  $('#' + prefix + '_meta').attr('checked', key.meta);
}

function assignKeyProperties(prefix, key) {
  key.key   = $('#' + prefix + '_key').val();
  key.ctrl  = $('#' + prefix + '_ctrl')[0].checked;
  key.shift = $('#' + prefix + '_shift')[0].checked;
  key.alt   = $('#' + prefix + '_alt')[0].checked;
  key.meta  = $('#' + prefix + '_meta')[0].checked;
  return key;
}

var bg = chrome.extension.getBackgroundPage();

$(document).ready(function() {

  // load the saved options
  var closeTabKey = bg.getCloseTabKey();
  var newTabKey = bg.getNewTabKey();

  displayKey("close", closeTabKey);
  displayKey("new_tab", newTabKey);

  $("#closed_tabs_size").val(bg.getClosedTabsSize());
  $("#search_string").val(bg.getSearchString());
  $("#history_filter").val(bg.getHistoryFilter());
  $("#custom_css").val(bg.getCustomCss());
  $("#auto_search_bookmarks").attr('checked', bg.autoSearchBookmarks());
  $("#show_dev_tools").attr('checked', bg.showDevTools());
  $("#show_urls").attr('checked', bg.showUrls());
  $('input:radio[name="search_type"]').val([bg.searchType()]);
  $("#search_urls").attr('checked', bg.searchUrls());
  $("#show_tab_count").attr('checked', bg.showTabCount());
  $("#show_tooltips").attr('checked', bg.showTooltips());
  $("#show_favicons").attr('checked', bg.showFavicons());
  $("#show_pinned_tabs").attr('checked', bg.showPinnedTabs());
  $("#tabs_in_window_order").attr('checked', bg.orderTabsInWindowOrder());
  $("#tabs_by_url").attr('checked', bg.orderTabsByUrl());
  $("#pageup_pagedown_skip_size").val(bg.pageupPagedownSkipSize());
  $("#move_left_on_switch").attr('checked', bg.moveLeftOnSwitch());
  $("#move_right_on_switch").attr('checked', bg.moveRightOnSwitch());
  $("#move_on_popup_switch_only").attr('checked', bg.moveOnPopupSwitchOnly());
  $("#restore_last_searched_str").attr('checked', bg.restoreLastSearchedStr());
  $("#jumpTo_latestTab_onClose").attr('checked', bg.getJumpToLatestTabOnClose());
  $("#tab_order_update_delay").val(bg.getTabOrderUpdateDelay());
  $("#debounce_delay").val(bg.getDebounceDelay());

  // if a shortcut key is defined alert the user that the shortcut key configuration has changed
  var sk = bg.getShortcutKey();
  if(sk.pattern() !== "") {
    $(".shortcutAlert > p").text("WARNING: the popup window shortcut key is now managed by Chrome, your old setting was " +
        sk.pattern() + ", see below.");

    $(".shortcutAlert")
        .fadeTo('slow', 1)
        .animate({opacity: 1.0}, 3000);

    $("#shortcut_done").click(function () {
      bg.clearOldShortcutKey();
      $(".shortcutAlert").slideUp();
    });
  }

  // Update status to let user know options were saved.
  $("#save_btn").click(function() {
    bg.setCloseTabKey(assignKeyProperties("close", closeTabKey));
    bg.setNewTabKey(assignKeyProperties("new_tab", newTabKey));

    bg.setClosedTabsSize($("#closed_tabs_size").val());
    bg.setSearchString($("#search_string").val());
    bg.setHistoryFilter($("#history_filter").val());
    bg.setCustomCss($("#custom_css").val());
    bg.setShowUrls($("#show_urls").is(':checked'));
    bg.setSearchType($('input:radio[name="search_type"]:checked').val());
    bg.setSearchUrls($("#search_urls").is(':checked'));
    bg.setShowTabCount($("#show_tab_count").is(':checked'));
    bg.setShowTooltips($("#show_tooltips").is(':checked'));
    bg.setShowFavicons($("#show_favicons").is(':checked'));
    bg.setShowPinnedTabs($("#show_pinned_tabs").is(':checked'));
    bg.setOrderTabsInWindowOrder($("#tabs_in_window_order").is(':checked'));
    bg.setOrderTabsByUrl($("#tabs_by_url").is(':checked'));
    bg.setAutoSearchBookmarks($("#auto_search_bookmarks").is(':checked'));
    bg.setShowDevTools($("#show_dev_tools").is(':checked'));
    bg.setPageupPagedownSkipSize($("#pageup_pagedown_skip_size").val());
    bg.setMoveLeftOnSwitch($("#move_left_on_switch").is(':checked'));
    bg.setMoveRightOnSwitch($("#move_right_on_switch").is(':checked'));
    bg.setMoveOnPopupSwitchOnly($("#move_on_popup_switch_only").is(':checked'));
    bg.setRestoreLastSearchedStr($("#restore_last_searched_str").is(':checked'));
    bg.setJumpToLatestTabOnClose($("#jumpTo_latestTab_onClose").is(':checked'));
    bg.setTabOrderUpdateDelay($("#tab_order_update_delay").val());
    bg.setDebounceDelay($("#debounce_delay").val());
    // bg.rebindShortcutKeys();
    bg.updateBadgeText();

    // Update status to let user know options were saved.
    $(".alert").text("Options saved.")
            .fadeTo('slow', 1)
            .animate({opacity: 1.0}, 3000)
            .fadeTo('slow', 0);
  });
});
