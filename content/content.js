let popup = null;

document.addEventListener('mouseup', handleMouseUp);
document.addEventListener('mousedown', handleMouseDown);

function handleMouseDown(e) {
    if (popup && !popup.contains(e.target)) {
        removePopup();
    }
}

async function handleMouseUp(e) {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text && text.length > 0) {
        // Check if sidebar is open before showing popup
        try {
            if (!chrome.storage || !chrome.storage.local) return;
            const result = await chrome.storage.local.get('sidebarOpen');
            if (result.sidebarOpen) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                showPopup(rect, text);
            }
        } catch (err) {
            // Extension context invalidated
        }
    }
}

function showPopup(rect, text) {
    removePopup();

    popup = document.createElement('div');
    popup.id = 'neonote-popup';
    popup.innerHTML = `
    <button id="neonote-add-btn" title="Add Note">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
    </button>
  `;

    // Position at bottom right of selection with 8px margin
    const top = rect.bottom + window.scrollY + 8;
    const left = rect.right + window.scrollX + 8;

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    document.body.appendChild(popup);

    document.getElementById('neonote-add-btn').onclick = () => {
        chrome.runtime.sendMessage({
            type: 'ADD_HIGHLIGHT_NOTE',
            text: text,
            url: window.location.href,
        });

        // Clear selection
        window.getSelection().removeAllRanges();
        removePopup();
    };
}

function removePopup() {
    if (popup) {
        popup.remove();
        popup = null;
    }
}

// Shortcut Listener
let cachedSettings = null;

async function updateSettings() {
    try {
        if (!chrome.storage || !chrome.storage.local) return;
        const result = await chrome.storage.local.get('settings');
        cachedSettings = result.settings || {
            toggleShortcut: 'Meta+0',
            submitShortcut: 'Meta+Enter'
        };
    } catch (err) {
        // Context invalidated
    }
}

updateSettings();

chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings) {
        cachedSettings = changes.settings.newValue;
    }
});

document.addEventListener('keydown', (e) => {
    // Ignore if inside an input/textarea (unless it's a modifier-heavy shortcut that we want to override?)
    // Usually good practice to not trigger if user is typing, but for "Toggle Sidebar" (Cmd+\ or Ctrl+\) it is usually fine.
    // However, let's avoid if target is editable to be safe, unless it is a very specific command.
    // Actually, user might want to toggle while typing in a form on the page. Configurable shortcuts usually skip this check if modifiers are involved.

    // We need to fetch settings every time or cache it? caching is better but need to listen for changes.
    // For simplicity, let's get it. (Storage.local is fast enough usually, or we can use a variable updated by onChanged)

    if (!cachedSettings || !cachedSettings.toggleShortcut) return;

    if (matchesShortcut(e, cachedSettings.toggleShortcut)) {
        e.preventDefault();
        const selection = window.getSelection().toString();
        try {
            chrome.runtime.sendMessage({
                type: 'TOGGLE_SIDEBAR',
                selectionText: selection
            });
        } catch (err) {
            // Context invalidated
        }
    }
});

function matchesShortcut(event, shortcutString) {
    if (!shortcutString) return false;

    const parts = shortcutString.split('+');
    const key = parts.pop();
    const modifiers = parts;

    // Check key
    // Handle special cases if necessary, but usually event.key is good.
    // "Space" -> " " in event.key
    let eventKey = event.key;
    if (eventKey === ' ') eventKey = 'Space';
    if (eventKey.length === 1) eventKey = eventKey.toUpperCase();

    if (key.toUpperCase() !== eventKey.toUpperCase()) return false;

    // Check modifiers
    const meta = modifiers.includes('Meta');
    const ctrl = modifiers.includes('Ctrl');
    const alt = modifiers.includes('Alt');
    const shift = modifiers.includes('Shift');

    return event.metaKey === meta &&
        event.ctrlKey === ctrl &&
        event.altKey === alt &&
        event.shiftKey === shift;
}

// Add Ping detector
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PING') {
        sendResponse({ status: 'OK' });
    }
});
