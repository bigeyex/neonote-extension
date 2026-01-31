// LLM Integration for Volcengine
// OpenAI-compatible API

const BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

const SUMMARY_PROMPT = `You are an expert at analyzing web content. Given a web page's text content, extract the main opinions expressed and the evidence supporting each opinion.

Output your response as a JSON array with this structure:
[
  {
    "opinion": "A clear statement of the opinion",
    "evidences": ["Evidence 1", "Evidence 2", ...]
  }
]

Rules:
1. Extract 3-7 main opinions from the content.
2. Each opinion should have 1-3 supporting evidences (quotes or paraphrases from the text).
3. Focus on substantive opinions, not trivial statements.
4. Keep opinions concise but complete.
5. Return ONLY the JSON array, no other text.`;

export async function getLLMConfig() {
    const result = await chrome.storage.local.get('llmConfig');
    return result.llmConfig || {};
}

export async function summarizeWithLLM(pageContent) {
    const config = await getLLMConfig();
    const { apiKey, modelId } = config;

    if (!apiKey) {
        throw new Error('LLM API key not configured. Please configure it in Settings.');
    }

    // Truncate content if too long (rough limit)
    const maxLength = 30000;
    const truncatedContent = pageContent.length > maxLength
        ? pageContent.substring(0, maxLength) + '...[truncated]'
        : pageContent;

    const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: modelId || 'doubao-seed-1-8-251228',
            messages: [
                { role: 'system', content: SUMMARY_PROMPT },
                { role: 'user', content: truncatedContent }
            ],
            temperature: 0.3
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`LLM API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error('No response from LLM');
    }

    return parseOpinions(content);
}

function parseOpinions(content) {
    try {
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('No valid JSON found in response');
    } catch (e) {
        console.error('Failed to parse LLM response:', content);
        throw new Error('Failed to parse LLM response');
    }
}
