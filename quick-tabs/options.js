function displayKey(prefix, key) {
  $('#' + prefix + '_key').val(key.key);
  $('#' + prefix + '_ctrl').attr('checked', key.ctrl);
  $('#' + prefix + '_shift').attr('checked', key.shift);
  $('#' + prefix + '_alt').attr('checked', key.alt);
  $('#' + prefix + '_meta').attr('checked', key.meta);
}

function assignKeyProperties(prefix, key) {
  key.key = $('#' + prefix + '_key').val();
  key.ctrl = $('#' + prefix + '_ctrl').attr('checked');
  key.shift = $('#' + prefix + '_shift').attr('checked');
  key.alt = $('#' + prefix + '_alt').attr('checked');
  key.meta = $('#' + prefix + '_meta').attr('checked');
  return key;
}

var bg = chrome.extension.getBackgroundPage();

$(document).ready(function() {

  // load the saved options
  var popup_key = bg.getShortcutKey();
  var closeTabKey = bg.getCloseTabKey();
  var closeAllTabsKey = bg.getCloseAllTabsKey();

  displayKey("popup", popup_key);
  displayKey("close", closeTabKey);
  displayKey("close_all", closeAllTabsKey);

  $("#closed_tabs_size").val(bg.getClosedTabsSize());
  $("#show_dev_tools").attr('checked', bg.showDevTools());
  $("#show_urls").attr('checked', bg.showUrls());
  $("#show_tooltips").attr('checked', bg.showTooltips());
  $("#show_favicons").attr('checked', bg.showFavicons());
  $("#search_string").val(bg.getSearchString());
  $("#search_delay").val(bg.getSearchDelay());

  $("#save_btn").click(function() {
    bg.setShortcutKey(assignKeyProperties("popup", popup_key));
    bg.setCloseTabKey(assignKeyProperties("close", closeTabKey));
    bg.setCloseAllTabsKey(assignKeyProperties("close_all", closeAllTabsKey));

    bg.setClosedTabsSize($("#closed_tabs_size").val());
    bg.setShowUrls($("#show_urls").attr('checked'));
    bg.setShowTooltips($("#show_tooltips").attr('checked'));
    bg.setShowFavicons($("#show_favicons").attr('checked'));
    bg.setSearchString($("#search_string").val());
    bg.setSearchDelay($("#search_delay").val());
    bg.setShowDevTools($("#show_dev_tools").attr('checked'));

    bg.rebindShortcutKeys();

    // Update status to let user know options were saved.
    $(".alert").text("Options saved.")
            .fadeTo('slow', 1)
            .animate({opacity: 1.0}, 3000)
            .fadeTo('slow', 0);
  });
});
