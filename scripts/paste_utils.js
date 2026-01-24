/**
 * Handles cleaning up pasted content to remove unwanted formatting.
 * @param {ClipboardEvent} e The paste event
 * @param {HTMLElement} editor The editor element
 */
export function handleCleanPaste(e, editor) {
    const items = e.clipboardData.items;
    let hasImage = false;

    // Check for images first (preserve existing logic)
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            hasImage = true;
            const blob = items[i].getAsFile();
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = document.createElement('img');
                img.src = event.target.result;
                editor.appendChild(img);
            };
            reader.readAsDataURL(blob);
            // If we handled an image, we might still want to handle text if it's a mixed paste, 
            // but usually images are separate items in the clipboard.
        }
    }

    // Default paste handling for text/html
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    if (html && !hasImage) {
        e.preventDefault();

        // Use a temporary element to sanitize the HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Recursively remove style and class attributes
        const sanitize = (node) => {
            if (node.nodeType === 1) { // Element node
                node.removeAttribute('style');
                node.removeAttribute('class');
                // You might also want to remove font-specific tags if they exist
                if (node.tagName === 'FONT') {
                    // Replace <font> with its children or <span>
                    const span = document.createElement('span');
                    while (node.firstChild) span.appendChild(node.firstChild);
                    node.parentNode.replaceChild(span, node);
                    sanitize(span);
                    return;
                }
            }
            for (let i = 0; i < node.childNodes.length; i++) {
                sanitize(node.childNodes[i]);
            }
        };

        sanitize(tempDiv);

        // Insert the cleaned HTML at the cursor position
        document.execCommand('insertHTML', false, tempDiv.innerHTML);
    } else if (text && !hasImage) {
        // Fallback to plain text if no HTML (or if we want to be even stricter, we could always use text)
        // But for now, let's keep basic structure like <b>, <i>, <a> which come with text/html
        // If we only wanted plain text, we would prevent default and insert text.
        // The default behavior for contenteditable already does some cleaning, 
        // but often keeps font-size from text/html.
    }
}
