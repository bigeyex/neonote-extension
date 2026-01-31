import { t, initI18n } from './scripts/i18n.js';
import { syncToLark } from './scripts/lark_sync.js';

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
    } else if (message.type === 'LANGUAGE_CHANGED') {
        setupContextMenu();
    }
});

// Context Menu Setup
function setupContextMenu() {
    initI18n().then(() => {
        const title = t('app.contextMenu');
        // pattern: try update, if fails, create.
        chrome.contextMenus.update('add-selection-to-neonote', {
            title: title,
            contexts: ['selection']
        }, () => {
            if (chrome.runtime.lastError) {
                // Not found, create it
                chrome.contextMenus.create({
                    id: 'add-selection-to-neonote',
                    title: title,
                    contexts: ['selection']
                }, () => {
                    // Silence duplicate ID or other creation errors
                    const _ = chrome.runtime.lastError;
                });
            }
        });
    }).catch(e => console.error('setupContextMenu failed:', e));
}

// Ensure context menu is set up on install/update/reload
chrome.runtime.onInstalled.addListener(() => {
    setupContextMenu();
});

// Also run once on service worker startup to ensure it's there
setupContextMenu();

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'add-selection-to-neonote' && info.selectionText) {
        openSidebarWithQuote(tab, info.selectionText);
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
                await syncToLark(config.link, config.token);
                console.log('Auto-sync completed at', new Date().toLocaleString());
            } catch (e) {
                console.error('Auto-sync failed:', e);
            }
        }
    }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command === 'toggle-sidebar') {
        if (tab) {
            toggleSidebar(tab);
        }
    } else if (command === 'add-selection-note') {
        if (tab) {
            // Try to get selection from tab
            let selectionText = null;
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => window.getSelection().toString()
                });
                if (results && results[0] && results[0].result) {
                    selectionText = results[0].result;
                }
            } catch (e) {
                console.log('Could not get selection via script (expected on some pages like PDFs):', e);
            }

            // For PDFs, we might not get selectionText via executeScript.
            // But we can still open the sidebar.
            openSidebarWithQuote(tab, selectionText);
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
        chrome.storage.local.set({ pendingQuote: { text: selectionText, url: tab.url } }, () => {
            safeSendMessage({ type: 'PROCESS_PENDING_QUOTE' });
        });
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
