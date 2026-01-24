/**
 * Handles application theme (Light/Dark/System)
 * Stores preference in chrome.storage.local
 */

const STORAGE_KEY = 'theme_preference';

export const THEMES = {
    SYSTEM: 'system',
    LIGHT: 'light',
    DARK: 'dark'
};

export async function initTheme() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const theme = result[STORAGE_KEY] || THEMES.SYSTEM;
    applyTheme(theme);

    // Listen for changes
    chrome.storage.onChanged.addListener((changes) => {
        if (changes[STORAGE_KEY]) {
            applyTheme(changes[STORAGE_KEY].newValue);
        }
    });
}

export function applyTheme(theme) {
    const root = document.documentElement;

    // Remove existing attributes
    root.removeAttribute('data-theme');

    if (theme === THEMES.SYSTEM) {
        // Let CSS @media (prefers-color-scheme) handle it
        return;
    }

    root.setAttribute('data-theme', theme);
}

export async function setTheme(theme) {
    await chrome.storage.local.set({ [STORAGE_KEY]: theme });
}

export async function getCurrentTheme() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || THEMES.SYSTEM;
}
