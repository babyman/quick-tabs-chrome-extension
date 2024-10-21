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

"use strict";

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

$(document).ready(async function() {
  await Config.init();

  // load the saved options
  var closeTabKey = Config.getKeyCombo(CLOSE_TAB_POPUP);
  var newTabKey = Config.getKeyCombo(NEW_TAB_POPUP);

  displayKey("close", closeTabKey);
  displayKey("new_tab", newTabKey);

  $('#closed_tabs_size').val(Config.get(CLOSED_TABS_SIZE));
  $('#search_string').val(Config.get(SEARCH_STRING));
  $('#history_filter').val(Config.get(HISTORY_FILTER));
  $('#custom_css').val(Config.get(CUSTOM_CSS));
  $('#auto_search_bookmarks').attr('checked', Config.get(AUTO_SEARCH_BOOKMARKS));
  $('#show_dev_tools').attr('checked', Config.get(INCLUDE_DEV_TOOLS));
  $('#show_urls').attr('checked', Config.get(SHOW_URLS));
  $('input:radio[name="search_type"]').val([Config.get(SEARCH_TYPE)]);
  $('#search_urls').attr('checked', Config.get(SEARCH_URLS));
  $('#show_tab_count').attr('checked', Config.get(SHOW_TAB_COUNT));
  $('#show_tooltips').attr('checked', Config.get(SHOW_TOOLTIPS));
  $('#show_favicons').attr('checked', Config.get(SHOW_FAVICONS));
  $('#show_pinned_tabs').attr('checked', Config.get(SHOW_PINNED_TABS));
  $('#tabs_in_window_order').attr('checked', Config.get(ORDER_TABS_IN_WINDOW_ORDER));
  $('#tabs_by_url').attr('checked', Config.get(ORDER_TABS_BY_URL));
  $('#pageup_pagedown_skip_size').val(Config.get(PAGEUP_PAGEDOWN_SKIP_SIZE));
  $('#move_left_on_switch').attr('checked', Config.get(MOVE_LEFT_ON_SWITCH));
  $('#move_right_on_switch').attr('checked', Config.get(MOVE_ON_SWITCH));
  $('#move_on_popup_switch_only').attr('checked', Config.get(MOVE_ON_POPUP_SWITCH_ONLY));
  $('#restore_last_searched_str').attr('checked', Config.get(RESTORE_LAST_SEARCHED_STR));
  $('#jumpTo_latestTab_onClose').attr('checked', Config.get(JUMP_TO_LATEST_TAB_ON_CLOSE));
  $('#tab_order_update_delay').val(Config.get(TAB_ORDER_UPDATE_DELAY));
  $('#debounce_delay').val(Config.get(DEBOUNCE_DELAY));
  $('#closed_tabs_list_save').attr('checked', Config.get(CLOSED_TABS_LIST_SAVE));

  // if a shortcut key is defined alert the user that the shortcut key configuration has changed
  var sk = Config.getKeyCombo(KEY_POPUP);
  if(sk.pattern() !== "") {
    $(".shortcutAlert > p").text("WARNING: the popup window shortcut key is now managed by Chrome, your old setting was " +
        sk.pattern() + ", see below.");

    $(".shortcutAlert")
        .fadeTo('slow', 1)
        .animate({opacity: 1.0}, 3000);

    $("#shortcut_done").click(function () {
      Config.set(KEY_POPUP, null);
      $(".shortcutAlert").slideUp();
    });
  }

  // Update status to let user know options were saved.
  $("#save_btn").click(function() {
    Config.setKeyCombo(CLOSE_TAB_POPUP, assignKeyProperties("close", closeTabKey));
    Config.setKeyCombo(NEW_TAB_POPUP, assignKeyProperties("new_tab", newTabKey));

    Config.set(CLOSED_TABS_SIZE, $('#closed_tabs_size').val());
    Config.set(SEARCH_STRING, $('#search_string').val());
    Config.set(HISTORY_FILTER, $('#history_filter').val());
    Config.set(CUSTOM_CSS, $('#custom_css').val());
    Config.set(SHOW_URLS, $('#show_urls').is(':checked'));
    Config.set(SEARCH_TYPE, $('input:radio[name="search_type"]:checked').val());
    Config.set(SEARCH_URLS, $('#search_urls').is(':checked'));
    Config.set(SHOW_TAB_COUNT, $('#show_tab_count').is(':checked'));
    Config.set(SHOW_TOOLTIPS, $('#show_tooltips').is(':checked'));
    Config.set(SHOW_FAVICONS, $('#show_favicons').is(':checked'));
    Config.set(SHOW_PINNED_TABS, $('#show_pinned_tabs').is(':checked'));
    Config.set(ORDER_TABS_IN_WINDOW_ORDER, $('#tabs_in_window_order').is(':checked'));
    Config.set(ORDER_TABS_BY_URL, $('#tabs_by_url').is(':checked'));
    Config.set(AUTO_SEARCH_BOOKMARKS, $('#auto_search_bookmarks').is(':checked'));
    Config.set(INCLUDE_DEV_TOOLS, $('#show_dev_tools').is(':checked'));
    Config.set(PAGEUP_PAGEDOWN_SKIP_SIZE, $('#pageup_pagedown_skip_size').val());
    Config.set(MOVE_LEFT_ON_SWITCH, $('#move_left_on_switch').is(':checked'));
    Config.set(MOVE_ON_SWITCH, $('#move_right_on_switch').is(':checked'));
    Config.set(MOVE_ON_POPUP_SWITCH_ONLY, $('#move_on_popup_switch_only').is(':checked'));
    Config.set(RESTORE_LAST_SEARCHED_STR, $('#restore_last_searched_str').is(':checked'));
    Config.set(JUMP_TO_LATEST_TAB_ON_CLOSE, $('#jumpTo_latestTab_onClose').is(':checked'));
    Config.set(TAB_ORDER_UPDATE_DELAY, $('#tab_order_update_delay').val());
    Config.set(DEBOUNCE_DELAY, $('#debounce_delay').val());
    Config.set(CLOSED_TABS_LIST_SAVE, $('#closed_tabs_list_save').is(':checked'));
    chrome.runtime.sendMessage({ call: 'reloadConfig' });

    // Update status to let user know options were saved.
    $(".alert").text("Options saved.")
            .fadeTo('slow', 1)
            .animate({opacity: 1.0}, 3000)
            .fadeTo('slow', 0);
  });
});
