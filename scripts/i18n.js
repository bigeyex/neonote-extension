const translations = {
    en: {
        // General
        'app.title': 'NeoNote',
        'app.home': 'NeoNote Home',
        'app.contextMenu': 'Add Selection to NeoNote',
        'app.addSelection': 'Add Selection',

        // Settings - Sidebar
        'nav.tags': 'Tags',
        'nav.settings': 'Settings',

        // Settings - Main
        'settings.title': 'Settings',

        'settings.theme.title': 'Theme',
        'settings.theme.desc': 'Choose how NeoNote looks.',
        'settings.theme.system': 'Follow System',
        'settings.theme.light': 'Light Mode',
        'settings.theme.dark': 'Dark Mode',

        'settings.language.title': 'Language',
        'settings.language.desc': 'Choose your preferred language.',

        'settings.shortcuts.title': 'Shortcuts',
        'settings.shortcuts.desc': 'Customize keyboard shortcuts.',
        'settings.shortcuts.toggle': 'Toggle Sidepanel',
        'settings.shortcuts.submit': 'Submit Note',
        'settings.shortcuts.reset': 'Reset to default',

        'settings.bitable.title': 'Lark Bitable Sync',
        'settings.bitable.desc': 'Configure sync to Lark/Feishu Bitable.',
        'settings.bitable.link': 'Bitable Link (URL)',
        'settings.bitable.token': 'Personal Base Token',
        'settings.bitable.autoSync': 'Enable Auto-Sync',
        'settings.bitable.interval': 'Interval (minutes)',
        'settings.bitable.save': 'Save Config',

        'settings.llm.title': 'LLM Settings',
        'settings.llm.desc': 'Configure AI model for page summarization.',
        'settings.llm.provider': 'Provider',
        'settings.llm.apiKey': 'API Key',
        'settings.llm.modelId': 'Model ID',
        'settings.llm.thinking': 'Enable Thinking (Reasoning)',
        'settings.llm.save': 'Save LLM Config',

        // Messages
        'msg.configSaved': 'Configuration saved!',
        'msg.llmSaved': 'LLM configuration saved!',
        'msg.syncSuccess': 'Sync completed successfully!',
        'msg.syncFailed': 'Sync failed: ',
        'msg.configureBitable': 'Please configure Bitable settings first.',
        'msg.noteCreated': 'Note created successfully!',
        'msg.tagAdded': 'Added tag',
        'msg.tagRemoved': 'Removed tag',
        'msg.deleteConfirm': 'Delete note?',
        'msg.noActiveTab': 'No active tab found.',
        'msg.configureLLM': 'Please configure LLM settings first.',
        'msg.getContentFailed': 'Could not get page content',

        // Sidepanel
        'sidepanel.search.placeholder': 'Search notes...',
        'sidepanel.tooltip.sync': 'Sync to Lark Bitable',
        'sidepanel.tooltip.home': 'Open Home Dashboard',
        'sidepanel.tooltip.urlFilter': 'Toggle URL Filter',
        'sidepanel.tooltip.summarize': 'Summarize Page',
        'sidepanel.tooltip.clearFilter': 'Clear filters',
        'sidepanel.save': 'Save',
        'sidepanel.editor.placeholder': 'Take a note...',
        'sidepanel.recentTags': 'Recent Tags',
        'sidepanel.tooltip.addTag': "Add tag '{tag}' to note (Alt+{n})",

        'sidepanel.summary.thinking': 'Thinking...',
        'sidepanel.summary.generating': 'Generating...',
        'sidepanel.summary.stop': 'Stop generating',
        'sidepanel.summary.failed': 'Summarize failed: ',

        // Home
        'home.search.placeholder': 'Search all notes...',
        'home.allNotes': 'All Notes',
        'home.folder.newNote': 'Create New Note',
        'home.placeholder.type': 'Type your note here... #tag',
        'home.btn.save': 'Save Note'
    },
    zh: {
        // General
        'app.title': 'NeoNote',
        'app.home': 'NeoNote 主页',
        'app.contextMenu': '添加到 NeoNote',
        'app.addSelection': '添加选中内容',

        // Settings - Sidebar
        'nav.tags': '标签',
        'nav.settings': '设置',

        // Settings - Main
        'settings.title': '设置',

        'settings.theme.title': '主题',
        'settings.theme.desc': '选择 NeoNote 的外观风格。',
        'settings.theme.system': '跟随系统',
        'settings.theme.light': '浅色模式',
        'settings.theme.dark': '深色模式',

        'settings.language.title': '语言',
        'settings.language.desc': '选择您偏好的语言。',

        'settings.shortcuts.title': '快捷键',
        'settings.shortcuts.desc': '自定义键盘快捷键。',
        'settings.shortcuts.toggle': '切换侧边栏',
        'settings.shortcuts.submit': '提交笔记',
        'settings.shortcuts.reset': '重置默认',

        'settings.bitable.title': '飞书多维表格同步',
        'settings.bitable.desc': '配置同步到飞书/Lark 多维表格。',
        'settings.bitable.link': '多维表格链接 (URL)',
        'settings.bitable.token': '个人 Base Token',
        'settings.bitable.autoSync': '启用自动同步',
        'settings.bitable.interval': '间隔 (分钟)',
        'settings.bitable.save': '保存配置',

        'settings.llm.title': 'AI 设置',
        'settings.llm.desc': '配置用于页面总结的 AI 模型。',
        'settings.llm.provider': '服务商',
        'settings.llm.apiKey': 'API Key',
        'settings.llm.modelId': '模型 ID',
        'settings.llm.thinking': '开启深度思考 (Reasoning)',
        'settings.llm.save': '保存 AI 配置',

        // Messages
        'msg.configSaved': '配置已保存！',
        'msg.llmSaved': 'AI 配置已保存！',
        'msg.syncSuccess': '同步成功完成！',
        'msg.syncFailed': '同步失败：',
        'msg.configureBitable': '请先配置多维表格设置。',
        'msg.noteCreated': '笔记创建成功！',
        'msg.tagAdded': '已添加标签',
        'msg.tagRemoved': '已移除标签',
        'msg.deleteConfirm': '确认删除笔记？',
        'msg.noActiveTab': '未找到活动标签页。',
        'msg.configureLLM': '请先配置 AI 设置。',
        'msg.getContentFailed': '无法获取页面内容',

        // Sidepanel
        'sidepanel.search.placeholder': '搜索笔记...',
        'sidepanel.tooltip.sync': '同步到飞书多维表格',
        'sidepanel.tooltip.home': '打开主页控制台',
        'sidepanel.tooltip.urlFilter': '切换 URL 过滤',
        'sidepanel.tooltip.summarize': '总结当前页面',
        'sidepanel.tooltip.clearFilter': '清除筛选',
        'sidepanel.save': '保存',
        'sidepanel.editor.placeholder': '记笔记...',
        'sidepanel.recentTags': '最近标签',
        'sidepanel.tooltip.addTag': "添加标签 '{tag}' 到笔记 (Alt+{n})",

        'sidepanel.summary.thinking': '思考中...',
        'sidepanel.summary.generating': '生成中...',
        'sidepanel.summary.stop': '停止生成',
        'sidepanel.summary.failed': '总结失败：',

        // Home
        'home.search.placeholder': '搜索所有笔记...',
        'home.allNotes': '所有笔记',
        'home.folder.newNote': '创建新笔记',
        'home.placeholder.type': '在此输入笔记... #标签',
        'home.btn.save': '保存笔记'
    }
};

let currentLang = 'en';

export async function initI18n() {
    // Try to get from storage
    const result = await chrome.storage.local.get('language');
    if (result.language) {
        currentLang = result.language;
    } else {
        // Detect browser language
        const browserLang = navigator.language.toLowerCase();
        if (browserLang.startsWith('zh')) {
            currentLang = 'zh';
        } else {
            currentLang = 'en';
        }
    }

    if (typeof document !== 'undefined') {
        updatePageText();
    }
    return currentLang;
}

export function t(key, params = {}) {
    const text = translations[currentLang]?.[key] || translations['en'][key] || key;
    if (Object.keys(params).length > 0) {
        return text.replace(/\{(\w+)\}/g, (match, p1) => params[p1] !== undefined ? params[p1] : match);
    }
    return text;
}

export async function setLanguage(lang) {
    if (translations[lang]) {
        currentLang = lang;
        await chrome.storage.local.set({ language: lang });
        if (typeof document !== 'undefined') {
            updatePageText();
        }

        // Dispatch event for other components to react if needed
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('languageChanged', { detail: lang }));
        }
        chrome.runtime.sendMessage({ type: 'LANGUAGE_CHANGED', lang });
    }
}

export function getLanguage() {
    return currentLang;
}

function updatePageText() {
    if (typeof document === 'undefined') return;
    const elements = document.querySelectorAll('[data-i18n], [data-i18n-tooltip], [data-i18n-placeholder]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            // Handle different element types
            if (el.tagName === 'INPUT' && el.type === 'text' && el.placeholder) {
                // For inputs with placeholders, strictly speaking we should have a data-i18n-attr="placeholder" 
                // but for simplicity let's handle placeholder if it's an input
                el.placeholder = t(key);
            } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = t(key);
            } else {
                el.textContent = t(key);
            }
        }

        const tooltipKey = el.getAttribute('data-i18n-tooltip');
        if (tooltipKey) {
            el.title = t(tooltipKey);
            // Also update data-tooltip if present (for our custom tooltips)
            if (el.hasAttribute('data-tooltip')) {
                el.setAttribute('data-tooltip', t(tooltipKey));
            }
        }

        const placeholderKey = el.getAttribute('data-i18n-placeholder');
        if (placeholderKey) {
            el.placeholder = t(placeholderKey);
        }
    });
}
