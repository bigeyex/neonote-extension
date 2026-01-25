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
    } else if (message.type === 'UPDATE_AUTO_SYNC') {
        setupAutoSync();
    }
});

// Setup Initial Auto Sync
setupAutoSync();

async function setupAutoSync() {
    await chrome.alarms.clear('auto-sync');
    const result = await chrome.storage.local.get(['bitableConfig']);
    const config = result.bitableConfig;

    if (config && config.autoSync && config.link && config.token) {
        const interval = parseFloat(config.interval) || 10;
        chrome.alarms.create('auto-sync', { periodInMinutes: interval });
        console.log(`Auto-sync scheduled every ${interval} minutes`);
    } else {
        console.log('Auto-sync disabled or not configured');
    }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'auto-sync') {
        const result = await chrome.storage.local.get(['bitableConfig']);
        const config = result.bitableConfig;

        if (config && config.link && config.token) {
            try {
                // Dynamically import sync function
                const { syncToLark } = await import('./scripts/lark_sync.js');
                await syncToLark(config.link, config.token);
                console.log('Auto-sync completed at', new Date().toLocaleString());
            } catch (e) {
                console.error('Auto-sync failed:', e);
            }
        }
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
