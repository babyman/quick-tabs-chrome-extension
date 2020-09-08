[![Version][version-badge]][qt-store]
[![Rating][rating-badge]][qt-store]
[![Users][users-badge]][qt-store]

# INTRODUCTION

Quick Tabs is a tab management browser extension for the Google Chrome web browser based on the "Recent Files" quick selector built into the excellent IntelliJ IDEA by Jetbrains.

Quick Tabs allows you to move quickly between recently used tabs without requiring the use of your mouse, locate and switch to tabs as you need them with minimal keystrokes even when you have large numbers of open tabs.

Visit the [Quick Tabs](https://chrome.google.com/extensions/detail/jnjfeinjfmenlddahdjdmgpbokiacbbb) google extensions page to install and try it out ...

# FEATURES

* Lists all the open tabs in Chrome across all of your open windows
* Tabs are listed in most recently used (MRU) order and excludes the current tab (since you're switching tabs)
* Fuzzy search your bookmarks:
  * Bookmarks are automatically searched when only a few tabs match your search string
  * Add a space at the start or end of your search string to search bookmarks along with tabs
  * Start your search with `/b` or add **two spaces** at the start or end of your search string to search only bookmarks
* Fuzzy search your browser history:
  * Start your search with `/h` or add **three spaces** at the start or end of your search string to search browser history
* Find noisy tabs by searching for `<))`
* Chrome keyboard shortcuts (configured using the keyboard shortcuts dialog at the bottom of the Chrome Extensions page):
  * Shortcut key to launch popup window from most tabs (default ctrl+e, cmd+e on Mac, ctrl+q on Linux).
  * Select previous tab without loading the popup window (unmapped by default)
  * Select next tab without loading the popup window (unmapped by default)
  * IMPORTANT the 'next tab' shortcut is only available for a second or so (while the badge text is orange) before the current tab is moved to the top of the MRU list.
* Tab list popup shortcut keys:
  * Select previous tab (same as Chrome keyboard shortcut or up arrow)
  * Select next tab (same as Chrome keyboard shortcut or down arrow)
  * Switch to selected Item (enter)
  * To close selected tab (default ctrl+d, see extension options)
* Displays the number of tabs you currently have open in all your Chrome windows
* Quickly search and select tabs by typing letters in the page title or url
* Track recently closed tabs and allow them to be searched and restored
* Popup customization using css

# COMMANDS

Commands start with a `/` and can be typed in the popup window search box to tweak the search behaviour or perform actions on tabs;

### Query Commands

* `/b <query>` - search bookmarks
* `/h <query>` - search browser history
* `/w <query>` - search the tabs in the current window only
* `/p <query>` - search pinned tabs only

### Search Types

You can now change the search type for a single search, this can help if you have a specific search string in engine combo in mind.

* `/fuzzy <query>` - use the fuzzy search engine for this query only 
* `/fuse <query>` - use the fuse search engine for this query only 
* `/regex <query>` - use the regex search engine for this query only 
* `/subs <query>` - use the subs search engine for this query only 

### Tab Management

Tab management commands all accept RegExp search queries.

* `/close <query>` - search for and close tabs
* `/merge <query>` - merge tabs into the current window
* `/split <query>` - split tabs and move them into a new window
* `/reload <query>` - reload all of the tabs in the search result
* `/mute <query>` - mute the tabs in the search result
* `/unmute <query>` - unmute the tabs in the search result

# PERMISSIONS

Quick Tabs requires the following:

* **Read and change your browsing history**: _read only_ access is required to record your open tabs and search browser history.
* **Read and change your bookmarks**: _read only_ access is required to search and display your bookmarks.


# SCREENSHOTS

#### Quick Tabs ready for action.

![Popup Screenshot](screenshots/in_action.png?raw=true)

#### Tab and bookmark search.

![Search Screenshot](screenshots/searching_tabs.png?raw=true)

#### History search.

![Search History](screenshots/searching_history.png?raw=true)

Search your browser history by starting your search with '/h ' or adding 3 spaces to the end of your search query.

#### Decide what to show.

![Search History](screenshots/go_minimal.png?raw=true)

#### Custom CSS styling.

![Search Screenshot](screenshots/custom_css.png?raw=true)

In this case https://userstyles.org/styles/99938/better-styling-for-chrome-extension-quick-tabs by @Bunnyslippers.  See the [./3rdParty/css](./3rdParty/css) directory.


# SOURCE

The source code for this extension is available on [github](http://github.com/babyman/quick-tabs-chrome-extension), please feel free to inspect it before you install this extension, especially as I am asking permission to interact with your computer and its private data.

You can also install it manually if you want to be certain that the source code on github is directly what you install. Note, this will NOT automatically update the extension when bugs are fixed and features are added.

In your terminal, `cd` to the folder you want to clone it to, and run `git clone https://github.com/babyman/quick-tabs-chrome-extension`. Then in Google Chrome, click `Window - Extensions`, click the checkbox called "Developer Mode", and click the "Load unpacked extension" button. Navigate to the cloned project, and select the "quick-tabs" folder. You now have the plugin loaded as a developer. Again, this will NOT automatically update the extension when bugs are fixed and features are added.


# FEEDBACK AND BUGS

Please report all your valuable feedback, feature requests and bug reports on the github [issues page](http://github.com/babyman/quick-tabs-chrome-extension/issues) for this extension.

# AND FINALLY

If you find Quick Tabs useful and want to buy me a coffee, I really like coffee :D ...

[![ko-fi](https://www.ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/V7V71963F)


# RELEASE NOTES

2020.9.8 - merged pull request #330, fix for issue that some undefined elements, thanks @jaekyeom (refs #326).

2020.6.30 - upgrade jQuery (fixes #318)

2020.6.3 - fix bug #315 adding spaces to search bookmarks and histories no longer working

2020.5.31 - merge pull request #314 to fix undefined tabs, thanks @NicoWeio (refs #251, #310, #275, #313).  Added back the space prefix to search bookmarks and history, fixes #311, support searching pinned tabs only `/p `, fixes #290

2020.3.10 - combined the code that handles the `no tabs match` keyboard and empty tab list triggers to behave more consistently, fixes #302

2020.1.26 - bug fix, "Can't switch to "discarded" tabs" fixes #300

2020.1.25 - merge pull request #211, "add option to order tabs in window order" thanks @gregsadetsky and request #301, "Fix command key combination issue in popup" thanks @powpowshen also switch search type used by commands from substr to regexp, see #299. 

2020.1.18 - bug fix, "when no tabs match" stopped working, fixes #298

2020.1.13 - call .stopPropagation() in click event handlers, refs #295, add debouncing to improve the responsiveness of the UI when entering queries, refs #297

2020.1.8 - refined tab moving options, see 'Only move tabs when switched via the extension popup', fixes #296

2020.1.5 - add support to keep window tabs in MRU order with the 'Move tab to leftmost position on switch' option see #174

2019.12.29 - **Quick Tabs turns 10!**, added new commands '/close', '/merge', '/mute', '/unmute', '/split' and '/reload', '/w' to search tabs in the current window only, also allow specifying the search engine as part of the query (/fuzzy, /fuse, /regex, /subs).  Merged code for option to hide pinned tabs, thanks @hbj.

2019.12.2 - fix #277 and #291 for real this time!

2019.11.30 - Updated the bookmark and history searches to use '/b ' and '/h ' as query prefixes, still use '  ' and '   ' as query postfixes.  Fixed a bug with the pg up/down list scrolling.  Fixed issue that prevented prev-tab key working in popup windows (issue #277). 

2019.11.27 - fix tab focus issue #273, thanks @fwextensions for the pointer

2019.11.23 - merged pull request to allow configuration of the "tab order update delay", see ticket #90 (thanks @AlexeyKabelitskiy)

2019.4.22 - merged pull requests to ensure https:// is used for default google search (thanks #ericlaw1979), apply {{urlStyle}} to recently closed tabs (thanks @boika), improve tab switching (thanks @MartinLichtblau)

2019.2.27 - merged pull request that fixes #229 #245 #246 (and perhaps #232), also changes that improve switching tabs behaviour, thanks @MartinLichtblau.  Added 'theRealPadster.css' large icon theme, thanks @theRealPadster.

2019.1.30 - merged pull request to prevent tabs opened in the background jumping to the head of the recently used list (#219, thanks @MartinLichtblau)

2019.1.20 - merged pull request to fix result highlighting issues that included curly braces (#242, thanks @DoctorGester)

2019.1.10 - merged pull request to improve fuzzy search results (#241, thanks @MartinLichtblau)

2018.11.26 - fixed invalid css (#200, thanks @boika), added license file (#212), updated shortcut config documentation (thanks @Kevin-Prichard) and added support to retain the popup search string (thanks @MeetM)

2017.10.8 - fixed scrolling issue (fixes #195)

2017.10.7 - merge title tooltip fix, thanks @Rohaq. Also merged in jQuery update and some code cleanup, thanks @toanju. Changed the scrolling code to use noobscroll.js

2017.5.10 - fix issue where current tab is displayed on initial popup rendering (fixes #170)

2017.5.3.1 - bookmark search bug fix

2017.5.3 - substring bug fix

2017.5.2 - change the search implementation to allow users to select between fuzzy, fuze, regex or substring tab searching (fixes #167, #97)

2017.4.25 - possible workaround for existing Chrome bug (refs #91, #168), thanks @TimNZ

2016.9.20 - switched the tab search library to fuse.js (thanks to @rajington), fix window focus problem when using keyboard only (#101, #145 thanks @pearj)

2016.7.16 - change default extension key to ctrl+q on Linux since ctrl+e does not work, thanks @zweicoder (fixed #138), open a website address from the search box in the popup (#108), it takes a second to reorder tabs in a list after switching between tabs (fixed #103)

2016.3.20 - fix data: favicon handling bug (#124)

2016.3.15.1 - fix URL encoding bug

2016.3.15 - switch template engine to mustache.js to simplify render code (remove iframe/sandbox and speed up overall popup render), fix option key save bug (#119), add option to prevent auto searching bookmarks (#115).

2016.3.12 - fix issue where popup window height would increase on window redraw css fixes, thanks @easyfuckingpeasy. Typo fix, thanks @elimisteve

2016.3.10 - fixes

2015.10.13 - removed default key mappings for next/previous to prevent unexpected chrome behaviours (#99)

2015.10.9 - update the next/prev popup window shortcut keys to use the same mappings as the command keys

2015.10.7 - work around Window list positioned oddly (#91), thanks @todoakaio. Added media indicator favicon, search for "<))" to show only noisy tabs (#59). Added shortcut keys to switch between tabs in the tab list without displaying the popup (#93). Added delay before moving tabs to the top of the tab list (#90)

2015.6.14 - merged option to move the tab to the last tab when switching, thanks @phorust

2015.4.30 - fixed issue when rendering bookmarklet code in search results, thanks @benbarth. Added history filter option, allows history search results to be filtered through a regular expression and exclude matches (for example this can be used to exclude past google searches)

2015.4.18 - optimize secondary history searches

2015.4.17 - fixed issue opening urls when they contain search character matches. Added support to fuzzy history search by starting or ending the search string with 3 spaces

2015.4.8 - underline search string hits, add option to include URLs when searching even if they are not being displayed in the tab list

2015.3.31 - added show/hide badge tab count option, removed the css rules that forced the popup window to a specific size (allowing chrome to manage that)

2015.3.12 - added css option placeholder to avoid confusion over expected textarea content

2015.3.8 - popup window timers, separate mouse hover style from keyboard navigation focus to prevent focus jumps when the popup opens under the mouse pointer

2015.3.3 - popup window cleanup, search urls only if displayed

2015.2.28 - library updates, better scrolling, search bookmarks by starting or ending your search string with spaces

2015.2.26 - performance improvements, fuzzy searching and tighter UI

2015.2.25 - added support for bookmarks search ( **IMPORTANT adding bookmark search required adding bookmark permissions, READ ONLY access only** ) and UI style updates, huge thanks to @oarrabi for this

2015.1.2 - delay script execution till window.onload fires (closes #70), thanks @aakash-shah

2014.12.27 - re-enable mouseover events (close #69), thanks @KayNoSpam

2014.12.23 - quick fixes for the two reoccurring errors, thanks @heavyk.  Moved the template rendering code into a sandbox as per https://developer.chrome.com/extensions/sandboxingEval

2014.9.27 - support custom css through the extensions option page, this supports custom styling of the popup window (for example https://userstyles.org/styles/99938/better-styling-for-chrome-extension-quick-tabs by @Bunnyslippers)

2014.9.13 - permissions fix, thanks @jtanner

2014.7.8 - More stability improvements

2014.7.6.1 - NPE bug fix

2014.7.6 - bug fixes and allow cycling through with TAB and SHIFT+TAB (close #28), allow PageUp/PageDown navigation (close #53), thanks @eush77

2014.7.1 - merged fix to html encoding bug, thanks @eush77

2014.5.6 - add vim style next/prev keys to popup, thanks @roblund

2014.4.4 - performance improvements, thanks @philippotto for the work and inspiration (and @olado for doT.js)

2014.1.14 - fixed shortcut keys issue

2014.1.12 - merged design improvements, thanks @rodrigok

2013.11.2 - merged shortcut key update, thanks @Mononofu, based on this update I have rewritten the shortcut code and stripped all the content-script stuff out, no more tab reload warnings or window placement issues and the extension works on chrome:// pages

2013.8.4 - merged fix for issue #35, thanks @kho

2013.6.24 - merged fix for issue #8, thanks @yaauie

2013.5.1 - fix for bug #44, Showing nonexistent "New Tabs" open with incorrect total

2013.1.23 - bug fixes, removed console logging

2012.12.9 - bug fixes, pressing the popup load shortcut once the popup has loaded now selects the next tag in the list

2012.12.8 - bug fixes and performance improvements

2012.12.7 - bug fixes and code updates

2012.12.4 - applied patches from @konk303 (line hight, ctrl+n/ctrl+p tab select keyboard shortcuts), @ignacysokolowski (search delay option and integer parse bug) and @slay2k (huge code update, updated to manifest version 2, library version updates and improved search matching)

2011.2.18 - applied patches from @yaauie, option to set search provider, open popup in the middle of current window, compatible with multiple monitors

2010.6.27 - applied crtl+D tab close tab focus enhancement patch from @osheroff

2010.5.8 - updated since chrome bug fix to allow tab focus switching between windows in 5.0.375.29 - big thanks to @clayhinson.  If a tab search returns no results and you press enter a new tab will be opened and if the search is a url it is loaded in the tab otherwise a google search is performed.

2010.3.2 - fixed a bug that cause the popup to close in dev version 5.0.336.0 (39716)  - thanks @ds :D

2010.2.21 - added more display options and improved scrollbar - thanks @Randy

2010.1.31 - better list scrolling and fixed some minor bugs

2010.1.30 - fixed display when urls are hidden, also resolved shortcut key issues created in the last release

2010.1.17 - changed default popup keys to ctrl+m due to windows issues, added button to close selected tab

2010.1.9 - css fixes for popup  window, option to hide URL's

0.9.10 - exclude devtools by default, ctrl+d and ctrl+shift+d shortcuts added

0.9.9 - added options page, recently closed tab tracking, shortcut key configuration and fixed search list highlighting bug

0.9.8 - removed tab auto-reload on install, now alert users when tab reload is required

0.9.7 - bug fixes

0.9.6 - reduced popup size when few tabs are open

0.9.5 - fixed missing scrollbars on Linux


# ACKNOWLEDGEMENTS

Inspired by
http://www.jetbrains.com/idea/

Icon image based on photo by Ged Carroll found at
http://www.flickr.com/photos/renaissancechambara/3380657988/

Blank Icon by Deleket (Jo)
http://deleket.deviantart.com/

[version-badge]: https://img.shields.io/chrome-web-store/v/jnjfeinjfmenlddahdjdmgpbokiacbbb.svg?style=flat&label=Version
[rating-badge]: https://img.shields.io/chrome-web-store/stars/jnjfeinjfmenlddahdjdmgpbokiacbbb.svg?style=flat&label=Rating
[users-badge]: https://img.shields.io/chrome-web-store/users/jnjfeinjfmenlddahdjdmgpbokiacbbb.svg?style=flat&label=Users
[qt-store]: https://chrome.google.com/webstore/detail/quick-tabs/jnjfeinjfmenlddahdjdmgpbokiacbbb
