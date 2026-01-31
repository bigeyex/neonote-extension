import { saveNote, getAllNotes, deleteNote, getNotesByUrl, getRecentNotes } from '../scripts/db.js';
import { initTheme } from '../scripts/theme.js';
import { syncToLark } from '../scripts/lark_sync.js';
import { handleCleanPaste } from '../scripts/paste_utils.js';
import { getHostname } from '../scripts/utils.js';
import { summarizeWithLLM } from '../scripts/llm.js';
import { initI18n, t } from '../scripts/i18n.js';

const searchInput = document.getElementById('search');
const clearFiltersBtn = document.getElementById('clear-filters');
const editor = document.getElementById('editor-content');
const saveBtn = document.getElementById('save-note');
const notesList = document.getElementById('notes-list');
const urlToggleBtn = document.getElementById('toggle-url-filter');
const homeBtn = document.getElementById('open-home');
const syncBtn = document.getElementById('sync-files');
const tagSuggestions = document.getElementById('tag-suggestions');
const loadingIndicator = document.getElementById('loading-indicator');
const recentTagsContainer = document.getElementById('recent-tags');
const summarizeBtn = document.getElementById('summarize-page');
const draftCardsContainer = document.getElementById('draft-cards');
const reasoningDisplay = document.getElementById('reasoning-display');
const tooltip = document.getElementById('tooltip');

let recentTags = [];

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

    // Connect port to background for state tracking
    chrome.runtime.connect({ name: 'sidepanel' });

    await initTheme(); // Initialize theme
    await initI18n(); // Initialize i18n

    // Setup Infinite Scroll
    setupInfiniteScroll();

    await loadNotes(true); // Initial load
    await updateRecentTags();

    setupListeners();
    await processPendingHighlight();
    await processPendingQuote();

    if (currentTabId) {
        await ensureHighlighterInTab(currentTabId);
    }

    initTooltips();
}

// Notify when sidebar closes removed - handled by port disconnection

async function processPendingHighlight() {
    const result = await chrome.storage.local.get('pendingHighlight');
    if (result.pendingHighlight) {
        const { text, url } = result.pendingHighlight;
        await createNewHighlightNote(text, url);
        await chrome.storage.local.remove('pendingHighlight');
    }
}

async function processPendingQuote() {
    const result = await chrome.storage.local.get('pendingQuote');
    if (result.pendingQuote) {
        const { text, url } = result.pendingQuote;
        editor.innerHTML = `<div class="highlight-quote">"${text}"</div><div><br></div>`;

        // Focus at end
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        editor.focus();

        await chrome.storage.local.remove('pendingQuote');
    }
}

function setupListeners() {
    saveBtn.addEventListener('click', handleSave);

    homeBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('home/home.html') });
    });

    syncBtn.addEventListener('click', async () => {
        const svg = syncBtn.querySelector('svg');
        if (svg.classList.contains('spin')) return;

        const result = await chrome.storage.local.get(['bitableConfig']);
        const config = result.bitableConfig;

        if (!config || !config.link || !config.token) {
            chrome.tabs.create({ url: chrome.runtime.getURL('home/home.html?promptSync=1#settings') });
            return;
        }

        try {
            svg.classList.add('spin');
            await syncToLark(config.link, config.token);
            await loadNotes(true);
            // alert('Sync completed!'); 
        } catch (e) {
            console.error(e);
            alert('Sync failed: ' + e.message);
        } finally {
            svg.classList.remove('spin');
        }
    });

    urlToggleBtn.addEventListener('click', () => {
        currentFilter.urlOnly = !currentFilter.urlOnly;
        urlToggleBtn.classList.toggle('active', currentFilter.urlOnly);
        loadNotes(true);
    });

    summarizeBtn.addEventListener('click', handleSummarize);

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

    // Alt + 1-5 for recent tags
    document.addEventListener('keydown', (e) => {
        if (e.altKey && !isNaN(e.key) && e.key >= '1' && e.key <= '5') {
            const index = parseInt(e.key) - 1;
            if (recentTags[index]) {
                e.preventDefault();
                insertRecentTag(recentTags[index]);
            }
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Delete') {
            const selected = document.querySelector('.note-item.selected');
            if (selected) {
                handleDelete(selected.dataset.id);
            }
        }

        // Command + Shift + 1-5 for recent tags
        if (e.metaKey && e.shiftKey && e.code >= 'Digit1' && e.code <= 'Digit5') {
            const index = parseInt(e.code.replace('Digit', '')) - 1;
            if (recentTags[index]) {
                e.preventDefault();
                insertRecentTag(recentTags[index]);
            }
        }

        // Command + Shift + 9 for summarize
        if (e.metaKey && e.shiftKey && e.code === 'Digit9') {
            e.preventDefault();
            handleSummarize();
        }
    });

    editor.addEventListener('paste', (e) => handleCleanPaste(e, editor));
    editor.addEventListener('input', handleEditorInput);

    // Submit Shortcut
    editor.addEventListener('keydown', async (e) => {
        const settings = (await chrome.storage.local.get('settings')).settings;
        const submitShortcut = settings && settings.submitShortcut ? settings.submitShortcut : 'Meta+Enter';

        if (matchesShortcut(e, submitShortcut)) {
            e.preventDefault();
            handleSave();
        }
    });

    // Listen for tab changes
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (tabId === currentTabId && changeInfo.url) {
            currentUrl = changeInfo.url;
            if (currentFilter.urlOnly) loadNotes(true);
            ensureHighlighterInTab(tabId);
        }
    });

    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        currentUrl = tab.url;
        currentTabId = tab.id;
        if (currentFilter.urlOnly) loadNotes(true);
        ensureHighlighterInTab(currentTabId);
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'REFRESH_NOTES') {
            loadNotes(true);
        } else if (message.type === 'PROCESS_PENDING_HIGHLIGHT') {
            processPendingHighlight();
        } else if (message.type === 'PROCESS_PENDING_QUOTE') {
            processPendingQuote();
        } else if (message.type === 'CREATE_HIGHLIGHT_NOTE') {
            createNewHighlightNote(message.text, message.url);
        } else if (message.type === 'CLOSE_SIDEBAR_REQUEST') {
            window.close();
        }
    });
}

function matchesShortcut(event, shortcutString) {
    if (!shortcutString) return false;

    const parts = shortcutString.split('+');
    const key = parts.pop();
    const modifiers = parts;

    let eventKey = event.key;
    if (eventKey === ' ') eventKey = 'Space';
    if (eventKey.length === 1) eventKey = eventKey.toUpperCase();

    if (key.toUpperCase() !== eventKey.toUpperCase()) return false;

    const meta = modifiers.includes('Meta');
    const ctrl = modifiers.includes('Ctrl');
    const alt = modifiers.includes('Alt');
    const shift = modifiers.includes('Shift');

    return event.metaKey === meta &&
        event.ctrlKey === ctrl &&
        event.altKey === alt &&
        event.shiftKey === shift;
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
    await updateRecentTags();
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
        let displayHtml = note.html || note.content || '';
        displayHtml = displayHtml.replace(/#(\w+)/g, '<span class="inline-tag">#$1</span>');

        noteEl.innerHTML = `
      <div class="note-header">
        <span class="note-timestamp">${dateStr}</span>
        <button class="note-actions-btn delete-btn" title="Delete Note">
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

        noteEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-btn')) return;
            document.querySelectorAll('.note-item').forEach(el => el.classList.remove('selected'));
            noteEl.classList.add('selected');
        });

        noteEl.querySelector('.note-content').addEventListener('dblclick', function () {
            this.contentEditable = "true";
            this.focus();
            // Add paste listener for cleaned content
            this.addEventListener('paste', (e) => handleCleanPaste(e, this), { once: true });
        });

        noteEl.querySelector('.note-content').addEventListener('blur', async function () {
            this.contentEditable = "false";
            const newContent = this.innerText;
            const newHtml = this.innerHTML;
            const newTags = extractTags(newContent);
            await saveNote({ ...note, content: newContent, html: newHtml, tags: newTags });
            await updateRecentTags();
            // Don't full reload, just keep it there
        });

        const noteLink = noteEl.querySelector('.note-link');
        if (noteLink) {
            noteLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (!note.url) return;
                // Use Text Fragments to locate text
                let targetUrl = note.url;
                if (note.highlightText) {
                    const fragment = `#:~:text=${encodeURIComponent(note.highlightText)}`;
                    targetUrl += fragment;
                }
                chrome.tabs.create({ url: targetUrl });
            });
        }

        noteEl.querySelector('.delete-btn').addEventListener('click', () => handleDelete(note.id));

        notesList.appendChild(noteEl);
    });
}

async function handleDelete(id) {
    if (confirm('Delete this note?')) {
        await deleteNote(parseInt(id));
        const el = document.querySelector(`.note-item[data-id="${id}"]`);
        if (el) el.remove();
        await updateRecentTags();
    }
}

// handlePaste removed and replaced by handleCleanPaste from paste_utils.js

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

async function updateRecentTags() {
    try {
        const allNotes = await getAllNotes();
        // Sort by timestamp desc to get truly recent ones
        allNotes.sort((a, b) => b.timestamp - a.timestamp);

        const tags = [];
        const seen = new Set();

        for (const note of allNotes) {
            if (note.tags) {
                for (const tag of note.tags) {
                    if (!seen.has(tag)) {
                        seen.add(tag);
                        tags.push(tag);
                        if (tags.length >= 5) break;
                    }
                }
            }
            if (tags.length >= 5) break;
        }

        recentTags = tags;
        renderRecentTags();
    } catch (e) {
        console.error('Failed to update recent tags:', e);
    }
}

function renderRecentTags() {
    recentTagsContainer.innerHTML = '';

    // Header for recent tags if needed, or just plain tags
    // For now, keeping it simple as per previous design

    recentTags.forEach((tag, index) => {
        const tagEl = document.createElement('div');
        tagEl.className = 'recent-tag';
        tagEl.innerHTML = `<span class="recent-tag-index">${index + 1}</span>${tag}`;
        // Use t() for localized tooltip
        tagEl.dataset.tooltip = t('sidepanel.tooltip.addTag', { tag, n: index + 1 });
        tagEl.onclick = () => insertRecentTag(tag);
        recentTagsContainer.appendChild(tagEl);
    });
}

function insertRecentTag(tag) {
    editor.focus();
    // Insert at cursor if possible, else append
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        document.execCommand('insertText', false, ` #${tag} `);
    } else {
        editor.innerText += ` #${tag} `;
    }
    // Trigger input event to update suggestions if needed
    editor.dispatchEvent(new Event('input'));
}

async function ensureHighlighterInTab(tabId) {
    if (!tabId) return;

    // Skip for non-web pages
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:') || tab.url.startsWith('chrome-extension://')) {
            return;
        }
    } catch (e) {
        return;
    }

    try {
        // Try to ping the content script
        await chrome.tabs.sendMessage(tabId, { type: 'PING' });
        console.log('Highlighter is alive in tab:', tabId);
    } catch (e) {
        // If ping fails, inject the script
        console.log('Highlighter not found in tab, injecting...', tabId);
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content/content.js']
            });
            await chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: ['content/content.css']
            });
        } catch (err) {
            console.error('Failed to inject highlighter:', err);
        }
    }
}

// Global controller to handle aborts
let abortController = null;

async function handleSummarize() {
    if (!currentTabId) {
        alert(t('msg.noActiveTab'));
        return;
    }

    // Cancel previous request if any
    if (abortController) {
        abortController.abort();
    }
    abortController = new AbortController();

    // Check LLM config
    const configResult = await chrome.storage.local.get('llmConfig');
    const config = configResult.llmConfig;
    if (!config || !config.apiKey) {
        chrome.tabs.create({ url: chrome.runtime.getURL('home/home.html#settings') });
        alert(t('msg.configureLLM'));
        return;
    }

    summarizeBtn.classList.add('loading');

    // Setup reasoning display with stop button
    reasoningDisplay.innerHTML = '';
    reasoningDisplay.classList.remove('hidden');
    reasoningDisplay.classList.remove('error-box');

    // Create text container
    const textContainer = document.createElement('div');
    textContainer.className = 'reasoning-text';
    textContainer.textContent = t('sidepanel.summary.thinking');
    reasoningDisplay.appendChild(textContainer);

    // Create stop button
    const stopBtn = document.createElement('div');
    stopBtn.className = 'stop-btn';
    stopBtn.title = t('sidepanel.summary.stop');
    stopBtn.innerHTML = `
        <svg viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12"></rect>
        </svg>
    `;
    stopBtn.onclick = (e) => {
        e.stopPropagation();
        if (abortController) {
            abortController.abort();
            abortController = null;
            // UI cleanup handled in catch/finally
        }
    };
    reasoningDisplay.appendChild(stopBtn);

    try {
        // Get page content from content script
        const response = await chrome.tabs.sendMessage(currentTabId, { type: 'GET_PAGE_CONTENT' });
        if (!response || !response.content) {
            throw new Error(t('msg.getContentFailed'));
        }

        // Call LLM with reasoning callback & signal
        let currentLineText = '';

        const opinions = await summarizeWithLLM(response.content, (chunk) => {
            // Strip newlines to keep it a single line
            const cleanChunk = chunk.replace(/\n/g, ' ');
            currentLineText += cleanChunk;
            textContainer.textContent = currentLineText;

            // Check for overflow
            if (textContainer.scrollWidth > textContainer.clientWidth) {
                // Reset with the latest chunk if it overflows
                currentLineText = cleanChunk.trim();
                textContainer.textContent = currentLineText;
            }
        }, abortController.signal);

        // Hide reasoning when done
        reasoningDisplay.classList.add('hidden');
        reasoningDisplay.innerHTML = ''; // Clear text and button

        // Render draft cards
        renderDraftCards(opinions);

    } catch (e) {
        if (e.name === 'AbortError') {
            console.log('Summarization aborted by user');
            // Reset UI for cancellation
            reasoningDisplay.classList.add('hidden');
            reasoningDisplay.innerHTML = '';
        } else {
            console.error('Summarize failed:', e);
            showSummaryError(e.message);
        }
    } finally {
        summarizeBtn.classList.remove('loading');
        abortController = null;
    }
}

function showSummaryError(message) {
    reasoningDisplay.classList.add('error-box');
    reasoningDisplay.classList.remove('hidden');
    reasoningDisplay.innerHTML = `
        <div class="error-text">${t('sidepanel.summary.failed')} ${escapeHtml(message)}</div>
        <div class="error-close-btn" title="Close">×</div>
    `;

    reasoningDisplay.querySelector('.error-close-btn').onclick = () => {
        reasoningDisplay.classList.add('hidden');
        reasoningDisplay.classList.remove('error-box');
        reasoningDisplay.textContent = '';
    };
}

function renderDraftCards(opinions) {
    draftCardsContainer.innerHTML = '';

    if (!opinions || opinions.length === 0) {
        draftCardsContainer.classList.add('hidden');
        return;
    }

    draftCardsContainer.classList.remove('hidden');

    opinions.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'draft-card';
        card.dataset.index = index;

        const evidencesHtml = item.evidences && item.evidences.length > 0
            ? item.evidences.map(e => `<div class="evidence-item">• ${escapeHtml(e)}</div>`).join('')
            : '<div class="evidence-item">No evidences provided</div>';

        card.innerHTML = `
            <div class="draft-card-header">
                <div class="opinion-text">${escapeHtml(item.opinion)}</div>
                <button class="add-note-btn" title="Add as note">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
            </div>
            <div class="evidences-toggle" data-index="${index}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
                ${item.evidences ? item.evidences.length : 0} evidence(s)
            </div>
            <div class="evidences-list" data-index="${index}">
                ${evidencesHtml}
            </div>
        `;

        // Toggle evidences
        card.querySelector('.evidences-toggle').addEventListener('click', function () {
            this.classList.toggle('expanded');
            card.querySelector('.evidences-list').classList.toggle('expanded');
        });

        // Add as note
        card.querySelector('.add-note-btn').addEventListener('click', () => {
            convertDraftToNote(item.opinion, item.evidences || []);
            card.remove();
            if (draftCardsContainer.children.length === 0) {
                draftCardsContainer.classList.add('hidden');
            }
        });

        draftCardsContainer.appendChild(card);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function convertDraftToNote(opinion, evidences) {
    const evidenceText = evidences.length > 0
        ? '\n\nEvidences:\n' + evidences.map(e => `• ${e}`).join('\n')
        : '';

    const content = opinion + evidenceText;
    const html = `<div>${escapeHtml(opinion)}</div>` +
        (evidences.length > 0
            ? `<div class="highlight-quote" style="margin-top: 8px;">${evidences.map(e => `<div>• ${escapeHtml(e)}</div>`).join('')}</div>`
            : '');

    const note = {
        content: content,
        html: html,
        url: currentUrl,
        tags: ['summary']
    };

    await saveNote(note);
    loadNotes(true);
    await updateRecentTags();
}

function initTooltips() {
    // Use event delegation on the app container to handle dynamic elements
    const app = document.getElementById('app');

    app.addEventListener('mouseenter', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (!target) return;

        const text = target.getAttribute('data-tooltip');
        if (!text) return;

        tooltip.textContent = text;
        tooltip.classList.remove('hidden');

        const updatePosition = () => {
            const rect = target.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            const isHeaderButton = target.closest('header');

            // Default positioning: Above the center
            let top = rect.top - tooltipRect.height - 8;
            let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            let direction = 'above';

            // Special case: Header buttons or if no space above
            if (isHeaderButton || top < 0) {
                top = rect.bottom + 8;
                direction = 'below';
            }

            // Keep within viewport horizontally
            if (left < 8) left = 8;
            if (left + tooltipRect.width > window.innerWidth - 8) {
                left = window.innerWidth - tooltipRect.width - 8;
            }

            tooltip.style.top = `${top}px`;
            tooltip.style.left = `${left}px`;

            tooltip.classList.remove('tooltip-above', 'tooltip-below');
            tooltip.classList.add(`tooltip-${direction}`);
        };

        updatePosition();

        // Small delay for the animation
        requestAnimationFrame(() => {
            tooltip.classList.add('tooltip-visible');
        });
    }, true); // Use capture phase for mouseenter delegation

    app.addEventListener('mouseleave', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (!target) return;

        tooltip.classList.remove('tooltip-visible');
        const onTransitionEnd = () => {
            if (!tooltip.classList.contains('tooltip-visible')) {
                tooltip.classList.add('hidden');
            }
            tooltip.removeEventListener('transitionend', onTransitionEnd);
        };
        tooltip.addEventListener('transitionend', onTransitionEnd);
    }, true);
}

init();
