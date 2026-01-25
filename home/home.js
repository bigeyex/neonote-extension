import { getAllNotes, saveNote, deleteNote } from '../scripts/db.js';
import { initTheme, setTheme, getCurrentTheme, THEMES } from '../scripts/theme.js';

import { syncToLark } from '../scripts/lark_sync.js';
import { handleCleanPaste } from '../scripts/paste_utils.js';
import { getHostname } from '../scripts/utils.js';

// DOM Elements
const notesGrid = document.getElementById('notes-grid');
const searchInput = document.getElementById('search-input');
const tagsList = document.getElementById('tags-list');
// navHome removed - dashboard is default when interacting with tags/search
const navSettings = document.getElementById('nav-settings');
const viewDashboard = document.getElementById('view-dashboard');
const viewSettings = document.getElementById('view-settings');
const themeSelect = document.getElementById('theme-select');
const pageTitle = document.getElementById('page-title');

// Bitable Elements
const bitableLinkInput = document.getElementById('bitable-link');
const personalTokenInput = document.getElementById('personal-token');
const autoSyncEnable = document.getElementById('auto-sync-enable');
const syncIntervalInput = document.getElementById('sync-interval');
const saveBitableBtn = document.getElementById('save-bitable-config');
const syncHomeBtn = document.getElementById('sync-home');

let allNotes = [];
let currentFilter = { text: '', tag: null };
let toastContainer = null;
let hoveredNoteId = null;
let topTags = [];

async function init() {
    await initTheme();

    // Setup theme settings
    const currentTheme = await getCurrentTheme();
    themeSelect.value = currentTheme;
    themeSelect.addEventListener('change', (e) => setTheme(e.target.value));

    // Setup Shortcut settings
    await setupShortcutSettings();

    // Setup Bitable Settings
    await setupBitableSettings();

    // Load data
    await refreshNotes();

    // Close sidepanel when home dashboard is opened
    chrome.runtime.sendMessage({ type: 'CLOSE_SIDEBAR_REQUEST' });

    // Check for initial view from hash
    if (window.location.hash === '#settings') {
        switchView('settings');
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('promptSync') === '1') {
            showToast('Please configure your Bitable settings to enable sync.', 'warning');
        }
    }

    setupListeners();
}

async function setupBitableSettings() {
    const result = await chrome.storage.local.get(['bitableConfig']);
    const config = result.bitableConfig || {};
    if (config.link) bitableLinkInput.value = config.link;
    if (config.token) personalTokenInput.value = config.token;
    autoSyncEnable.checked = config.autoSync || false;
    syncIntervalInput.value = config.interval || 10;

    saveBitableBtn.addEventListener('click', async () => {
        const link = bitableLinkInput.value.trim();
        const token = personalTokenInput.value.trim();
        const autoSync = autoSyncEnable.checked;
        const interval = parseInt(syncIntervalInput.value) || 10;

        await chrome.storage.local.set({
            bitableConfig: { link, token, autoSync, interval }
        });

        // Notify background to update alarm
        chrome.runtime.sendMessage({ type: 'UPDATE_AUTO_SYNC' });

        showToast('Configuration saved!');
    });
}

function setupListeners() {
    // Navigation
    navSettings.addEventListener('click', () => switchView('settings'));

    // Search
    searchInput.addEventListener('input', (e) => {
        currentFilter.text = e.target.value.toLowerCase();
        switchView('dashboard');
        renderNotes();
    });

    searchInput.addEventListener('focus', () => {
        switchView('dashboard');
    });

    // Hover Shortcuts
    document.addEventListener('keydown', async (e) => {
        if (e.metaKey && e.shiftKey && e.code >= 'Digit1' && e.code <= 'Digit5' && hoveredNoteId) {
            const index = parseInt(e.code.replace('Digit', '')) - 1;
            const tag = topTags[index];
            if (tag) {
                e.preventDefault();
                if (hoveredNoteId === 'NEW_NOTE') {
                    // Logic for NEW NOTE editor
                    const editor = document.querySelector('.new-note-card .note-content.editor');
                    if (editor) {
                        const hashtag = `#${tag}`;
                        if (editor.innerText.includes(hashtag)) {
                            editor.innerText = editor.innerText.replace(new RegExp(`\\s?${hashtag}\\b`, 'g'), '').trim();
                        } else {
                            editor.innerText = `${hashtag} ${editor.innerText}`;
                        }
                        editor.dispatchEvent(new Event('input'));
                    }
                } else {
                    await toggleTagForNote(hoveredNoteId, tag);
                }
            }
        }
    });

    // Sync
    syncHomeBtn.addEventListener('click', async () => {
        const svg = syncHomeBtn.querySelector('svg');
        if (svg.classList.contains('spin')) return;

        const result = await chrome.storage.local.get(['bitableConfig']);
        const config = result.bitableConfig;

        if (!config || !config.link || !config.token) {
            alert('Please configure Bitable settings first.');
            switchView('settings');
            return;
        }

        try {
            svg.classList.add('spin');
            await syncToLark(config.link, config.token);
            await refreshNotes();
            alert('Sync completed successfully!');
        } catch (e) {
            console.error(e);
            alert('Sync failed: ' + e.message);
        } finally {
            svg.classList.remove('spin');
        }
    });
}

function switchView(viewName) {
    if (viewName === 'dashboard') {
        if (viewDashboard.classList.contains('active')) return;

        viewDashboard.classList.remove('hidden');
        viewSettings.classList.add('hidden');
        viewDashboard.classList.add('active');
        navSettings.classList.remove('active');
        renderTags();
    } else {
        if (!viewSettings.classList.contains('hidden')) return;

        viewDashboard.classList.add('hidden');
        viewSettings.classList.remove('hidden');
        viewDashboard.classList.remove('active');
        navSettings.classList.add('active');

        const activeTags = tagsList.querySelectorAll('.tag-item.active');
        activeTags.forEach(t => t.classList.remove('active'));
    }
}

async function refreshNotes() {
    allNotes = await getAllNotes();
    renderTags();
    renderNotes();
}

function renderTags() {
    const tagsMap = new Map();
    allNotes.forEach(note => {
        note.tags.forEach(tag => {
            tagsMap.set(tag, (tagsMap.get(tag) || 0) + 1);
        });
    });

    // Sort tags by count
    const sortedTags = [...tagsMap.entries()].sort((a, b) => b[1] - a[1]);
    topTags = sortedTags.slice(0, 5).map(t => t[0]);

    tagsList.innerHTML = '';

    // "All Notes" fake tag
    const allItem = document.createElement('div');
    allItem.className = `tag-item ${!currentFilter.tag ? 'active' : ''}`;
    allItem.innerHTML = `<span>All Notes</span><span class="tag-count">${allNotes.length}</span>`;
    allItem.onclick = () => {
        currentFilter.tag = null;
        pageTitle.textContent = 'All Notes';
        switchView('dashboard');
        renderTags();
        renderNotes();
    };
    tagsList.appendChild(allItem);

    sortedTags.forEach(([tag, count], idx) => {
        const item = document.createElement('div');
        item.className = `tag-item ${currentFilter.tag === tag ? 'active' : ''}`;

        let shortcutIndicator = '';
        if (idx < 5) {
            shortcutIndicator = `<span class="tag-shortcut-index" title="Cmd+Shift+${idx + 1} to toggle on hovered note">${idx + 1}</span>`;
        }

        item.innerHTML = `${shortcutIndicator}<span>#${tag}</span><span class="tag-count">${count}</span>`;
        item.onclick = () => {
            currentFilter.tag = tag;
            pageTitle.textContent = `#${tag}`;
            switchView('dashboard');
            renderTags();
            renderNotes();
        };
        tagsList.appendChild(item);
    });
}

function renderNotes() {
    let filtered = allNotes;

    if (currentFilter.tag) {
        filtered = filtered.filter(n => n.tags.includes(currentFilter.tag));
    }

    if (currentFilter.text) {
        filtered = filtered.filter(n =>
            n.content.toLowerCase().includes(currentFilter.text) ||
            n.url.toLowerCase().includes(currentFilter.text)
        );
    }

    notesGrid.innerHTML = '';

    // Add New Note card if no text filter is active
    if (!currentFilter.text) {
        const initialContent = currentFilter.tag ? `#${currentFilter.tag} ` : '';
        const newNoteEl = createNewNoteCard(initialContent);
        notesGrid.appendChild(newNoteEl);
    }

    filtered.sort((a, b) => b.timestamp - a.timestamp).forEach(note => {
        const noteEl = document.createElement('div');
        noteEl.className = 'note-item';
        noteEl.dataset.id = note.id;

        noteEl.addEventListener('mouseenter', () => { hoveredNoteId = note.id; });
        noteEl.addEventListener('mouseleave', () => { if (hoveredNoteId === note.id) hoveredNoteId = null; });
        const date = new Date(note.timestamp);
        const dateStr = date.toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        let displayHtml = note.html || note.content || '';
        // Normalize: remove existing spans to avoid double-wrapping
        displayHtml = displayHtml.replace(/<span class="inline-tag">#(\w+)<\/span>/g, '#$1');
        // Wrap hashtags
        displayHtml = displayHtml.replace(/#(\w+)/g, '<span class="inline-tag">#$1</span>');

        noteEl.innerHTML = `
      <div class="note-header">
        <span class="note-timestamp">${dateStr}</span>
        <button class="note-actions-btn delete-btn">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
      <div class="note-content" contenteditable="false">${displayHtml}</div>
      ${note.url ? `
      <div class="note-footer">
        <a href="${note.url}" class="note-link url-source" target="_blank">
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
           ${getHostname(note.url)}
        </a>
      </div>
      ` : ''}
    `;

        // Edit Logic (Simplified)
        const contentEl = noteEl.querySelector('.note-content');
        contentEl.addEventListener('dblclick', () => {
            contentEl.contentEditable = 'true';
            contentEl.focus();
            // Add paste listener for cleaned content
            contentEl.addEventListener('paste', (e) => handleCleanPaste(e, contentEl), { once: true });
        });

        // Save on Cmd+Enter
        contentEl.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                contentEl.blur(); // Triggers the blur handler which saves
            }
        });

        contentEl.addEventListener('blur', async () => {
            contentEl.contentEditable = 'false';
            const newContent = contentEl.innerText;
            const newHtml = contentEl.innerHTML;

            // Update tags
            const newTags = extractTags(newContent);

            await saveNote({ ...note, content: newContent, html: newHtml, tags: newTags });
            refreshNotes(); // re-render to update tags list
        });

        const deleteBtn = noteEl.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                if (confirm('Delete note?')) {
                    await deleteNote(note.id);
                    refreshNotes();
                }
            });
        }

        notesGrid.appendChild(noteEl);
    });
}

function extractTags(text) {
    const matches = text.match(/#(\w+)/g);
    return matches ? [...new Set(matches.map(t => t.slice(1)))] : [];
}

async function setupShortcutSettings() {
    const defaultShortcuts = {
        toggleShortcut: 'Meta+0',
        submitShortcut: 'Meta+Enter'
    };

    // Platform detection for defaults if needed (Mac uses Meta by default usually)
    // For Windows we might want 'Ctrl+\' but 'Meta' usually maps to Cmd on Mac and Win key on Windows.
    // However, for consistency we'll stick to 'Meta' (Cmd) on Mac and 'Ctrl' on Windows effectively within our logic if we parse it right.
    // But let's just use simple string storage for now. User can rebind.

    const result = await chrome.storage.local.get(['settings']);
    let settings = result.settings || {};

    // Merge defaults
    settings = { ...defaultShortcuts, ...settings };

    const toggleInput = document.getElementById('shortcut-toggle');
    const submitInput = document.getElementById('shortcut-submit');
    const resetToggle = document.getElementById('reset-shortcut-toggle');
    const resetSubmit = document.getElementById('reset-shortcut-submit');

    toggleInput.value = settings.toggleShortcut;
    submitInput.value = settings.submitShortcut;

    const recordShortcut = (e, input, key) => {
        e.preventDefault();
        e.stopPropagation();

        // Ignore single modifier keys
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

        const modifiers = [];
        if (e.metaKey) modifiers.push('Meta');
        if (e.ctrlKey) modifiers.push('Ctrl');
        if (e.altKey) modifiers.push('Alt');
        if (e.shiftKey) modifiers.push('Shift');

        let keyChar = e.key;
        if (keyChar === ' ') keyChar = 'Space';
        // Handle capitalized letters if Shift is not pressed? No, trust e.key but maybe normalize.
        if (keyChar.length === 1) keyChar = keyChar.toUpperCase();

        const shortcut = [...modifiers, keyChar].join('+');
        input.value = shortcut;
        input.classList.remove('recording');

        // Save
        settings[key] = shortcut;
        chrome.storage.local.set({ settings });

        input.blur();
    };

    const setupInput = (input, key) => {
        input.addEventListener('focus', () => {
            input.classList.add('recording');
            input.value = 'Press keys...';
        });

        input.addEventListener('blur', () => {
            input.classList.remove('recording');
            // If cancelled/blurred without input, restore value
            input.value = settings[key];
        });

        input.addEventListener('keydown', (e) => recordShortcut(e, input, key));
    };

    setupInput(toggleInput, 'toggleShortcut');
    setupInput(submitInput, 'submitShortcut');

    resetToggle.onclick = () => {
        settings.toggleShortcut = defaultShortcuts.toggleShortcut;
        toggleInput.value = settings.toggleShortcut;
        chrome.storage.local.set({ settings });
    };

    resetSubmit.onclick = () => {
        settings.submitShortcut = defaultShortcuts.submitShortcut;
        submitInput.value = settings.submitShortcut;
        chrome.storage.local.set({ settings });
    };
}

function createNewNoteCard(initialContent = '') {
    const card = document.createElement('div');
    card.className = 'note-item new-note-card';
    card.addEventListener('mouseenter', () => { hoveredNoteId = 'NEW_NOTE'; });
    card.addEventListener('mouseleave', () => { if (hoveredNoteId === 'NEW_NOTE') hoveredNoteId = null; });
    card.innerHTML = `
        <div class="note-header">
            <span class="note-timestamp">Create New Note</span>
        </div>
        <div class="note-content editor" contenteditable="true" placeholder="Type your note here... #tag">${initialContent}</div>
        <div class="note-footer">
            <button class="primary-btn save-btn">Save Note</button>
        </div>
    `;

    const editor = card.querySelector('.note-content');
    const saveBtn = card.querySelector('.save-btn');

    saveBtn.addEventListener('click', async () => {
        const content = editor.innerText.trim();
        if (!content) return;

        const tags = extractTags(content);
        const note = {
            content: content,
            html: editor.innerHTML,
            url: '',
            tags: tags
        };

        await saveNote(note);
        editor.innerHTML = '';
        await refreshNotes();
        showToast('Note created successfully!');
    });

    // Handle Cmd+Enter to save
    editor.addEventListener('keydown', async (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            saveBtn.click();
        }
    });

    return card;
}

async function toggleTagForNote(noteId, tag) {
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;

    let { content, html, tags } = note;
    const hashtag = `#${tag}`;
    const hasTag = tags.includes(tag);

    if (hasTag) {
        // Remove tag
        const regex = new RegExp(`\\s?${hashtag}\\b`, 'g');
        content = content.replace(regex, '').trim();

        // Remove the specific tagged span
        html = html.replace(new RegExp(`\\s?<span class="inline-tag">${hashtag}</span>\\b`, 'g'), '').trim();
        // Fallback for raw hashtag in html
        html = html.replace(new RegExp(`\\s?${hashtag}\\b`, 'g'), '').trim();

        // Final cleanup: remove any empty or whitespace-only inline-tag spans that might have been left
        html = html.replace(/<span class="inline-tag">\s*<\/span>/g, '').trim();

        tags = tags.filter(t => t !== tag);
    } else {
        // Add tag
        content = `${hashtag} ${content}`;
        // Prepend to HTML as well
        html = `<span class="inline-tag">${hashtag}</span> ${html}`;
        tags.push(tag);
    }

    await saveNote({ ...note, content, html, tags });
    await refreshNotes();
    showToast(`${hasTag ? 'Removed' : 'Added'} tag #${tag}`);
}

function showToast(message, type = 'success') {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-message">${message}</span>
    `;

    toastContainer.appendChild(toast);

    // Remove from DOM after animation
    setTimeout(() => {
        toast.remove();
        if (toastContainer.children.length === 0) {
            toastContainer.remove();
            toastContainer = null;
        }
    }, 3000);
}

init();
