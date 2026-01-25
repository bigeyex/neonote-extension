chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

let isSidebarOpen = false;

// Track sidepanel presence via port
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'sidepanel') {
        isSidebarOpen = true;
        chrome.storage.local.set({ sidebarOpen: true });
        port.onDisconnect.addListener(() => {
            isSidebarOpen = false;
            chrome.storage.local.set({ sidebarOpen: false });
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OPEN_SIDEBAR') {
        chrome.sidePanel.open({ windowId: sender.tab.windowId });
    } else if (message.type === 'ADD_HIGHLIGHT_NOTE') {
        safeSendMessage({
            type: 'CREATE_HIGHLIGHT_NOTE',
            text: message.text,
            url: message.url
        });
    } else if (message.type === 'TOGGLE_SIDEBAR') {
        toggleSidebar(sender.tab, message.selectionText);
    }
});

chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'toggle-sidebar') {
        if (tab) {
            toggleSidebar(tab);
        }
    }
});

function toggleSidebar(tab, selectionText = null) {
    if (isSidebarOpen && !selectionText) {
        // If already open and no new selection, toggle means CLOSE.
        safeSendMessage({ type: 'CLOSE_SIDEBAR_REQUEST' });
    } else {
        // If closed, or if we have new selection to process, OPEN/FOCUS.
        openSidebarWithQuote(tab, selectionText);
    }
}

function openSidebarWithQuote(tab, selectionText) {
    if (selectionText) {
        chrome.storage.local.set({ pendingQuote: { text: selectionText, url: tab.url } });
    }
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(err => {
        console.error('Failed to open sidePanel:', err);
    });
}

/**
 * Message the runtime safely by catching errors if no receiver exists.
 * Returns true if sent successfully, false otherwise.
 */
async function safeSendMessage(message) {
    try {
        await chrome.runtime.sendMessage(message);
        return true;
    } catch (e) {
        // This is expected if the sidepanel/home is not open
        console.log('safeSendMessage: No receiver for message', message.type);
        return false;
    }
}
