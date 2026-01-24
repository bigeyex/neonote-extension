import { getAllNotes, saveNote, deleteNote } from '../scripts/db.js';
import { initTheme, setTheme, getCurrentTheme, THEMES } from '../scripts/theme.js';

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

let allNotes = [];
let currentFilter = { text: '', tag: null };

async function init() {
    await initTheme();

    // Setup theme settings
    const currentTheme = await getCurrentTheme();
    themeSelect.value = currentTheme;
    themeSelect.addEventListener('change', (e) => setTheme(e.target.value));

    // Setup Shortcut settings
    await setupShortcutSettings();

    // Load data
    await refreshNotes();

    setupListeners();
}

function setupListeners() {
    // Navigation

    navSettings.addEventListener('click', () => switchView('settings'));

    // Search
    // Search: switch to dashboard and filter
    searchInput.addEventListener('input', (e) => {
        currentFilter.text = e.target.value.toLowerCase();
        switchView('dashboard');
        renderNotes();
    });

    searchInput.addEventListener('focus', () => {
        switchView('dashboard');
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

    sortedTags.forEach(([tag, count]) => {
        const item = document.createElement('div');
        item.className = `tag-item ${currentFilter.tag === tag ? 'active' : ''}`;
        item.innerHTML = `<span>#${tag}</span><span class="tag-count">${count}</span>`;
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

    filtered.sort((a, b) => b.timestamp - a.timestamp).forEach(note => {
        const noteEl = document.createElement('div');
        noteEl.className = 'note-item';

        // Timestamp
        const date = new Date(note.timestamp);
        const dateStr = date.toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        let displayHtml = note.html;
        displayHtml = displayHtml.replace(/#(\w+)/g, '<span class="inline-tag">#$1</span>');

        noteEl.innerHTML = `
      <div class="note-header">
        <span class="note-timestamp">${dateStr}</span>
        <button class="note-actions-btn delete-btn">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
      <div class="note-content" contenteditable="false">${displayHtml}</div>
      <div class="note-footer">
        <a href="${note.url}" class="note-link url-source" target="_blank">
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
           ${new URL(note.url).hostname}
        </a>
      </div>
    `;

        // Edit Logic (Simplified)
        const contentEl = noteEl.querySelector('.note-content');
        contentEl.addEventListener('dblclick', () => {
            contentEl.contentEditable = 'true';
            contentEl.focus();
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

        noteEl.querySelector('.delete-btn').addEventListener('click', async () => {
            if (confirm('Delete note?')) {
                await deleteNote(note.id);
                refreshNotes();
            }
        });

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


init();
