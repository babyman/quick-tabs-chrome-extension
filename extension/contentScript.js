document.addEventListener('keyup', keyboardNavigation, false);

function keyboardNavigation(e) {

    if (e.keyCode == 69 && !e.altKey && !e.shiftKey && e.ctrlKey) { // Alt + E
        var port = chrome.extension.connect({name: "quicktab"});
        port.postMessage({ command: "openQuickTabs" });
    }
}
