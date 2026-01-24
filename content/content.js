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
        const result = await chrome.storage.local.get('sidebarOpen');
        if (result.sidebarOpen) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            showPopup(rect, text);
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
