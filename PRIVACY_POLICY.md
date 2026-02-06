# Privacy Policy for NeoNote

**Last Updated: February 6, 2026**

NeoNote ("we," "our," or "the Extension") is committed to protecting your privacy. This Privacy Policy explains how we handle your information when you use our browser extension.

## 1. Information We Collect and How We Use It

NeoNote is designed to be a local-first tool. Most of your data stays on your device.

### a. Local Data Storage
- **Notes and Highlights**: When you create notes or highlight text, this data is stored locally on your device using your browser's IndexedDB and `chrome.storage.local`.
- **URLs and Page Metadata**: We store the URL and title of the pages where you take notes so you can easily find them later.
- **Settings**: Your preferences (theme, language, shortcuts) are stored locally.

### b. Feature-Specific Data Processing
- **AI Summarization**: If you use the "Summarize Page" feature, the text content of the active tab is sent to a third-party LLM provider (e.g., Volcengine Ark) to generate the summary. This only happens when you explicitly click the summarize button.
- **Cloud Sync**: If you configure "Lark/Feishu Bitable Sync," your notes and metadata will be transmitted to your specified Lark/Feishu base. This only occurs if you have provided a Bitable link and token.

## 2. Third-Party Services

NeoNote interacts with third-party services only at your request:

- **LLM Providers**: We use OpenAI-compatible APIs (defaulting to Volcengine) for AI features. Your data processed by these models is subject to the respective provider's privacy policy.
- **Lark/Feishu (ByteDance)**: If you enable sync, your data is subject to Lark's privacy terms.

**We do not sell, rent, or share your personal data with any other third parties.**

## 3. Permissions

The extension requires certain permissions to function:
- `sidePanel`: To display the user interface.
- `tabs` & `activeTab`: To associate notes with specific pages and extract content for AI.
- `storage`: To save your notes and settings locally.
- `scripting`: To enable highlighting and right-click functionality on web pages.
- `alarms`: To handle scheduled background tasks like auto-sync.
- `<all_urls>`: To allow the extension to work on any website you visit.

## 4. Data Security

Because your data is primarily stored locally, its security depends on the security of your device and browser. For cloud sync and AI features, we use standard HTTPS/TLS encryption for all data transmissions.

## 5. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by updating the "Last Updated" date at the top of this document.

## 6. Contact Us

If you have any questions about this Privacy Policy, please contact us through our GitHub repository or project page.
