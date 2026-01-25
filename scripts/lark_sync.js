import { getAllNotes, getNoteById, saveNote } from './db.js';

const LARK_API_BASE = 'https://base-api.feishu.cn/open-apis/bitable/v1';

/**
 * Syncs notes to Lark Bitable.
 * @param {string} bitableLink - The full URL of the Bitable base.
 * @param {string} personalToken - The Personal Base Token for authorization.
 * @returns {Promise<void>}
 */
export async function syncToLark(bitableLink, personalToken) {
    if (!bitableLink || !personalToken) {
        throw new Error('Missing Bitable Link or Personal Token');
    }

    const appToken = extractAppToken(bitableLink);
    if (!appToken) {
        throw new Error('Invalid Bitable Link');
    }

    const headers = {
        'Authorization': `Bearer ${personalToken}`,
        'Content-Type': 'application/json'
    };

    // 1. Check/Create Table
    const tableId = await ensureTable(appToken, headers);

    // 2. Check/Create Fields
    const fieldMap = await ensureFields(appToken, tableId, headers);

    // 3. Sync Content
    const syncResult = await chrome.storage.local.get(['lastSyncTime']);
    const lastSyncTime = syncResult.lastSyncTime || 0;

    await syncContent(appToken, tableId, headers, fieldMap, lastSyncTime);

    // 4. Update lastSyncTime
    await chrome.storage.local.set({ 'lastSyncTime': Date.now() });
}

function extractAppToken(url) {
    try {
        // pattern: .../base/<app_token>?... or .../base/<app_token>
        const match = url.match(/base\/([^?\/]+)/);
        return match ? match[1] : null;
    } catch (e) {
        return null;
    }
}

async function ensureTable(appToken, headers) {
    // List tables
    const listRes = await fetch(`${LARK_API_BASE}/apps/${appToken}/tables`, { headers });
    const listData = await listRes.json();

    if (listData.code !== 0) {
        throw new Error(`Failed to list tables: ${listData.msg}`);
    }

    const targetTable = listData.data.items.find(t => t.name === 'NEONote');
    if (targetTable) {
        return targetTable.table_id;
    }

    // Create table
    const createRes = await fetch(`${LARK_API_BASE}/apps/${appToken}/tables`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            table: { name: 'NEONote' }
        })
    });
    const createData = await createRes.json();
    if (createData.code !== 0) {
        throw new Error(`Failed to create table: ${createData.msg}`);
    }
    return createData.data.table_id;
}

async function ensureFields(appToken, tableId, headers) {
    // Schema definition: name -> type
    // 1: Text, 2: Number, 3: Single Select, 4: Multi Select, 5: Date, 7: Checkbox, 11: Url...
    // We will use Text for simplicity for most, maybe Date for timestamp.
    // Required fields: note_id (Text), content (Text), url (Url), tags (Text/MultiSelect), timestamp (Date/Text)

    const desiredFields = {
        'note_id': 1, // Text
        'content': 1, // Text
        'url': 1,   // Url - wait, type 11 needs object structure, let's stick to Text (1) for simplicity or check docs if needed. 
        // Actually type 1 is safest. Let's start with Text.
        'tags': 1,    // Text
        'timestamp': 5, // Date
        'html': 1      // Text
    };

    // Get existing fields
    const listRes = await fetch(`${LARK_API_BASE}/apps/${appToken}/tables/${tableId}/fields`, { headers });
    const listData = await listRes.json();
    if (listData.code !== 0) throw new Error(`List fields failed: ${listData.msg}`);

    const existingFields = listData.data.items;
    const fieldMap = {}; // name -> field_id

    for (const [name, type] of Object.entries(desiredFields)) {
        const found = existingFields.find(f => f.field_name === name);
        if (found) {
            fieldMap[name] = found.field_id;
        } else {
            // Create field
            const createRes = await fetch(`${LARK_API_BASE}/apps/${appToken}/tables/${tableId}/fields`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    field_name: name,
                    type: type
                })
            });
            const createData = await createRes.json();
            if (createData.code !== 0) console.warn(`Failed to create field ${name}`, createData);
            else fieldMap[name] = createData.data.field.field_id;
        }
    }

    return fieldMap;
}

async function syncContent(appToken, tableId, headers, fieldMap, lastSyncTime = 0) {
    const allLocalNotes = await getAllNotes();
    const localNotesToSyncUp = allLocalNotes.filter(n => n.timestamp > lastSyncTime);

    if (localNotesToSyncUp.length === 0) {
        console.log('No notes updated since last sync.');
        // We still continue to check for sync down if needed, but the current logic is based on existingRecords
    }

    // Fetch existing records to avoid duplicates (using note_id)
    let existingRecords = [];
    let pageToken = '';
    let hasMore = true;

    // Use sorting as requested by user
    const sortParam = encodeURIComponent(JSON.stringify(["timestamp DESC"]));

    while (hasMore) {
        const url = `${LARK_API_BASE}/apps/${appToken}/tables/${tableId}/records?page_size=500&sort=${sortParam}${pageToken ? `&page_token=${pageToken}` : ''}`;
        const res = await fetch(url, { headers });
        const data = await res.json();
        if (data.code !== 0 || !data.data || !data.data.items) {
            hasMore = false;
            break;
        }

        existingRecords = existingRecords.concat(data.data.items);
        hasMore = data.data.has_more;
        pageToken = data.data.page_token;
    }

    const recordsToCreate = [];
    const recordsToUpdate = [];

    for (const note of localNotesToSyncUp) {
        const noteIdStr = String(note.id);

        // Record lookup using field name 'note_id'
        const existing = existingRecords.find(r => r && r.fields && r.fields['note_id'] === noteIdStr);

        const recordFields = {
            'note_id': noteIdStr,
            'content': note.content || '',
            'html': note.html || '',
            'url': note.url || '',
            'tags': Array.isArray(note.tags) ? note.tags.join(', ') : '',
            'timestamp': note.timestamp
        };

        if (existing) {
            // Check if update needed (simple check: timestamp)
            // But 'timestamp' in note is creation time usually, or we only track created.
            // If we want to sync edits, we should compare content.
            // For now, let's strict update everything found to ensure latest state.
            recordsToUpdate.push({
                record_id: existing.record_id,
                fields: recordFields
            });
        } else {
            recordsToCreate.push({
                fields: {
                    ...recordFields
                }
            });
        }
    }

    // Batch Create
    if (recordsToCreate.length > 0) {
        // Chunk by 500
        for (let i = 0; i < recordsToCreate.length; i += 500) {
            const chunk = recordsToCreate.slice(i, i + 500);
            await fetch(`${LARK_API_BASE}/apps/${appToken}/tables/${tableId}/records/batch_create`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ records: chunk })
            });
        }
    }

    // Batch Update
    if (recordsToUpdate.length > 0) {
        for (let i = 0; i < recordsToUpdate.length; i += 500) {
            const chunk = recordsToUpdate.slice(i, i + 500);
            await fetch(`${LARK_API_BASE}/apps/${appToken}/tables/${tableId}/records/batch_update`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ records: chunk })
            });
        }
    }

    // --- SYNC DOWN ---
    // Identify records in Bitable that are newer than lastSyncTime
    const bitableNotesToSyncDown = existingRecords.filter(r => {
        const bitableTimestamp = r.fields['timestamp'] || 0;
        return bitableTimestamp > lastSyncTime;
    });

    for (const remote of bitableNotesToSyncDown) {
        const noteId = remote.fields['note_id'];
        const remoteTimestamp = remote.fields['timestamp'];
        const remoteContent = remote.fields['content'] || '';
        const remoteHtml = remote.fields['html'] || '';
        const remoteUrl = remote.fields['url'] || '';
        const remoteTags = remote.fields['tags'] ? remote.fields['tags'].split(',').map(t => t.trim()) : [];

        if (noteId) {
            const local = await getNoteById(noteId);
            if (!local || remoteTimestamp > local.timestamp) {
                // Update or create local note
                await saveNote({
                    id: parseInt(noteId),
                    content: remoteContent,
                    html: remoteHtml,
                    url: remoteUrl,
                    tags: remoteTags,
                    timestamp: remoteTimestamp
                }, true); // skipTimestampUpdate to preserve Bitable's timestamp
            }
        } else {
            // New record from Bitable (created manually there)
            // It doesn't have a note_id yet. We'll create it locally and then it will get a note_id.
            // But wait, if we create it locally now, it might get synced UP later.
            // To avoid duplication, we should ideally assign the back-synced note a note_id.
            const savedNoteId = await saveNote({
                content: remoteContent,
                html: remoteHtml,
                url: remoteUrl,
                tags: remoteTags,
                timestamp: remoteTimestamp
            }, true);

            // Update the record in Bitable with the new local ID
            await fetch(`${LARK_API_BASE}/apps/${appToken}/tables/${tableId}/records/${remote.record_id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    fields: { 'note_id': String(savedNoteId) }
                })
            });
        }
    }
}
