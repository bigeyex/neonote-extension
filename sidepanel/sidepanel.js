import { saveNote, getAllNotes, deleteNote, getNotesByUrl, getRecentNotes } from '../scripts/db.js';
import { initTheme } from '../scripts/theme.js';

const searchInput = document.getElementById('search');
const clearFiltersBtn = document.getElementById('clear-filters');
const editor = document.getElementById('editor-content');
const saveBtn = document.getElementById('save-note');
const notesList = document.getElementById('notes-list');
const urlToggleBtn = document.getElementById('toggle-url-filter');
const homeBtn = document.getElementById('open-home');
const tagSuggestions = document.getElementById('tag-suggestions');
const loadingIndicator = document.getElementById('loading-indicator');

let currentUrl = '';
let currentTabId = null;
let currentFilter = { text: '', urlOnly: true };
let pageOffset = 0;
const PAGE_LIMIT = 10;
let isLoading = false;
let hasMore = true;

// Initialize
async function init() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
            currentUrl = tab.url;
            currentTabId = tab.id;
        }
    } catch (e) {
        console.error('Failed to get active tab:', e);
    }

    // Notify that sidebar is ready
    chrome.runtime.sendMessage({ type: 'SIDEBAR_READY' });

    await initTheme(); // Initialize theme

    // Setup Infinite Scroll
    setupInfiniteScroll();

    await loadNotes(true); // Initial load

    setupListeners();
    await processPendingHighlight();
}

// Notify when sidebar closes
window.addEventListener('beforeunload', () => {
    chrome.runtime.sendMessage({ type: 'SIDEBAR_CLOSED' });
});

async function processPendingHighlight() {
    const result = await chrome.storage.local.get('pendingHighlight');
    if (result.pendingHighlight) {
        const { text, url } = result.pendingHighlight;
        await createNewHighlightNote(text, url);
        await chrome.storage.local.remove('pendingHighlight');
    }
}

function setupListeners() {
    saveBtn.addEventListener('click', handleSave);

    homeBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('home/home.html') });
    });

    urlToggleBtn.addEventListener('click', () => {
        currentFilter.urlOnly = !currentFilter.urlOnly;
        urlToggleBtn.classList.toggle('active', currentFilter.urlOnly);
        loadNotes(true);
    });

    searchInput.addEventListener('input', (e) => {
        currentFilter.text = e.target.value.toLowerCase();
        clearFiltersBtn.style.display = currentFilter.text ? 'block' : 'none';
        loadNotes(true);
    });

    clearFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        currentFilter.text = '';
        clearFiltersBtn.style.display = 'none';
        loadNotes(true);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Delete') {
            const selected = document.querySelector('.note-item.selected');
            if (selected) {
                handleDelete(selected.dataset.id);
            }
        }
    });

    editor.addEventListener('paste', handlePaste);
    editor.addEventListener('input', handleEditorInput);

    // Listen for tab changes
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (tabId === currentTabId && changeInfo.url) {
            currentUrl = changeInfo.url;
            if (currentFilter.urlOnly) loadNotes(true);
        }
    });

    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        currentUrl = tab.url;
        currentTabId = tab.id;
        if (currentFilter.urlOnly) loadNotes(true);
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'REFRESH_NOTES') {
            loadNotes(true);
        } else if (message.type === 'PROCESS_PENDING_HIGHLIGHT') {
            processPendingHighlight();
        } else if (message.type === 'CREATE_HIGHLIGHT_NOTE') {
            createNewHighlightNote(message.text, message.url);
        }
    });
}

async function createNewHighlightNote(text, url) {
    const note = {
        content: '',
        html: `<div class="highlight-quote">"${text}"</div><div><br></div>`,
        highlightText: text,
        url: url,
        tags: []
    };
    const noteId = await saveNote(note);
    loadNotes(true);

    // Put the newly created note in editing mode
    setTimeout(() => {
        const newNoteEl = document.querySelector(`.note-item[data-id="${noteId}"]`);
        if (newNoteEl) {
            newNoteEl.classList.add('selected');
            const contentEl = newNoteEl.querySelector('.note-content');
            contentEl.contentEditable = 'true';
            // Focus at the end of the content
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(contentEl);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            contentEl.focus();
        }
    }, 100);
}

async function handleSave() {
    const content = editor.innerText;
    const html = editor.innerHTML;
    if (!content.trim() && !html.includes('<img')) return;

    const tags = extractTags(content);
    const note = {
        content: content,
        html: html,
        url: currentUrl,
        tags: tags
    };

    await saveNote(note);
    editor.innerHTML = '';
    loadNotes(true);
}

function extractTags(text) {
    const matches = text.match(/#(\w+)/g);
    return matches ? [...new Set(matches.map(t => t.slice(1)))] : [];
}

async function loadNotes(reset = false) {
    if (isLoading) return;
    if (reset) {
        pageOffset = 0;
        hasMore = true;
        notesList.innerHTML = '';
        const sentinel = document.getElementById('sentinel');
        if (sentinel) sentinel.style.display = 'block'; // Ensure sentinel is visible for reset
    }
    if (!hasMore) return;

    isLoading = true;
    loadingIndicator.classList.remove('hidden');

    try {
        let notes = [];

        // If we are filtering, we fallback to client-side filtering of all notes for now because IndexedDB search is complex
        // Optimization: If no filter text/url, use pagination
        const isFiltering = currentFilter.text || currentFilter.urlOnly;

        if (isFiltering) {
            // Optimized: Only load all if it's the first page or we need to filter
            // Ideally we should cache 'allNotes' if filtering but for now:
            const allNotes = await getAllNotes();
            let filtered = allNotes;

            if (currentFilter.urlOnly) {
                const currentBaseUrl = currentUrl.split('#')[0];
                filtered = filtered.filter(n => n.url.split('#')[0] === currentBaseUrl);
            }

            if (currentFilter.text) {
                filtered = filtered.filter(n =>
                    n.content.toLowerCase().includes(currentFilter.text) ||
                    n.tags.some(t => t.toLowerCase().includes(currentFilter.text.replace('#', '')))
                );
            }

            filtered.sort((a, b) => b.timestamp - a.timestamp);

            // Fetch LIMIT + 1 to check if there are more
            const sliced = filtered.slice(pageOffset, pageOffset + PAGE_LIMIT + 1);

            if (sliced.length > PAGE_LIMIT) {
                hasMore = true;
                notes = sliced.slice(0, PAGE_LIMIT);
            } else {
                hasMore = false;
                notes = sliced;
            }

        } else {
            // Default View: Use DB Pagination
            // Fetch LIMIT + 1 to check if there are more
            const fetchedWithPeek = await getRecentNotes(PAGE_LIMIT + 1, pageOffset);

            if (fetchedWithPeek.length > PAGE_LIMIT) {
                hasMore = true;
                notes = fetchedWithPeek.slice(0, PAGE_LIMIT);
            } else {
                hasMore = false;
                notes = fetchedWithPeek;
            }
        }

        if (notes.length > 0) {
            renderNotes(notes);
            pageOffset += notes.length;
        }

        // If no more notes, hide sentinel to prevent observer triggering
        if (!hasMore) {
            const sentinel = document.getElementById('sentinel');
            if (sentinel) sentinel.style.display = 'none';
        }

    } catch (e) {
        console.error(e);
    } finally {
        isLoading = false;
        loadingIndicator.classList.add('hidden');
    }
}

function setupInfiniteScroll() {
    const sentinel = document.getElementById('sentinel');
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMore) {
            loadNotes(false);
        }
    }, { root: null, rootMargin: '50px' });

    if (sentinel) observer.observe(sentinel);
}

function renderNotes(notes) {
    // Note: notesList.innerHTML is cleared in loadNotes(true)
    notes.forEach(note => {
        const noteEl = document.createElement('div');
        noteEl.className = 'note-item';
        noteEl.dataset.id = note.id;

        // Format timestamp
        const date = new Date(note.timestamp);
        const dateStr = date.toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        // Format content with inline tags
        let displayHtml = note.html;
        displayHtml = displayHtml.replace(/#(\w+)/g, '<span class="inline-tag">#$1</span>');

        noteEl.innerHTML = `
      <div class="note-header">
        <span class="note-timestamp">${dateStr}</span>
        <button class="note-actions-btn delete-btn" title="Delete Note">
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

        noteEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-btn')) return;
            document.querySelectorAll('.note-item').forEach(el => el.classList.remove('selected'));
            noteEl.classList.add('selected');
        });

        noteEl.querySelector('.note-content').addEventListener('dblclick', function () {
            this.contentEditable = "true";
            this.focus();
        });

        noteEl.querySelector('.note-content').addEventListener('blur', async function () {
            this.contentEditable = "false";
            const newContent = this.innerText;
            const newHtml = this.innerHTML;
            const newTags = extractTags(newContent);
            await saveNote({ ...note, content: newContent, html: newHtml, tags: newTags });
            // Don't full reload, just keep it there
        });

        noteEl.querySelector('.note-link').addEventListener('click', (e) => {
            e.preventDefault();
            // Use Text Fragments to locate text
            let targetUrl = note.url;
            if (note.highlightText) {
                const fragment = `#:~:text=${encodeURIComponent(note.highlightText)}`;
                targetUrl += fragment;
            }
            chrome.tabs.create({ url: targetUrl });
        });

        noteEl.querySelector('.delete-btn').addEventListener('click', () => handleDelete(note.id));

        notesList.appendChild(noteEl);
    });
}

async function handleDelete(id) {
    if (confirm('Delete this note?')) {
        await deleteNote(parseInt(id));
        document.querySelector(`.note-item[data-id="${id}"]`).remove();
    }
}

function handlePaste(e) {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = document.createElement('img');
                img.src = event.target.result;
                editor.appendChild(img);
            };
            reader.readAsDataURL(blob);
        }
    }
}

async function handleEditorInput(e) {
    const text = editor.innerText;

    // Handle markdown lists
    if (e.inputType === 'insertText') {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const container = range.startContainer;
            const content = container.textContent;

            // Simple bullet list: "- " or "* "
            if (content.match(/^[-*]\s$/)) {
                document.execCommand('insertUnorderedList');
                container.textContent = '';
            }
            // Simple numbered list: "1. "
            else if (content.match(/^1\.\s$/)) {
                document.execCommand('insertOrderedList');
                container.textContent = '';
            }
        }
    }

    const lastWordMatch = text.match(/#(\w*)$/);

    if (lastWordMatch) {
        const query = lastWordMatch[1].toLowerCase();
        const allNotes = await getAllNotes();
        const allTags = [...new Set(allNotes.flatMap(n => n.tags))];
        const suggestions = allTags.filter(t => t.toLowerCase().startsWith(query)).slice(0, 5);

        if (suggestions.length > 0) {
            showSuggestions(suggestions);
        } else {
            tagSuggestions.classList.add('hidden');
        }
    } else {
        tagSuggestions.classList.add('hidden');
    }

    // Handle markdown lists simple version
    if (e.inputType === 'insertText' && (e.data === ' ' || e.data === '\n')) {
        // Basic markdown list detection could be added here
    }
}

function showSuggestions(suggestions) {
    tagSuggestions.innerHTML = '';
    suggestions.forEach(tag => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = '#' + tag;
        item.onclick = () => {
            const text = editor.innerText;
            editor.innerText = text.replace(/#\w*$/, '#' + tag + ' ');
            tagSuggestions.classList.add('hidden');
            editor.focus();
            // Move cursor to end
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(editor);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        };
        tagSuggestions.appendChild(item);
    });
    tagSuggestions.classList.remove('hidden');
}

init();
