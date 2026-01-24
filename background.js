chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OPEN_SIDEBAR') {
        chrome.sidePanel.open({ windowId: sender.tab.windowId });
    } else if (message.type === 'SIDEBAR_READY') {
        // Sidebar is now open and ready - store this state
        chrome.storage.local.set({ sidebarOpen: true });
    } else if (message.type === 'SIDEBAR_CLOSED') {
        chrome.storage.local.set({ sidebarOpen: false });
    } else if (message.type === 'ADD_HIGHLIGHT_NOTE') {
        // Forward to sidebar directly - sidebar should be open
        chrome.runtime.sendMessage({
            type: 'CREATE_HIGHLIGHT_NOTE',
            text: message.text,
            url: message.url
        });
    }
});
