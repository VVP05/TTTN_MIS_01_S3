// Dịch vụ AI Cloud Tầng 2: Google Gemini Flash (Siêu tốc ~0.5s - 1s)
// Sử dụng API REST chính thức qua fetch tích hợp sẵn của Node.js, không cần thư viện ngoài

function getGeminiConfig() {
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    const model = String(process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();
    return { apiKey, model };
}

function isGeminiAvailable() {
    const { apiKey } = getGeminiConfig();
    return Boolean(apiKey && apiKey.length > 10);
}

function formatMessagesForGemini(messages) {
    const contents = [];

    for (const msg of messages) {
        if (!msg || !msg.content) continue;
        if (msg.role === 'system') continue;

        const role = msg.role === 'assistant' ? 'model' : 'user';
        contents.push({
            role,
            parts: [{ text: String(msg.content) }]
        });
    }

    if (contents.length === 0 || contents[contents.length - 1].role !== 'user') {
        const lastMsg = messages[messages.length - 1];
        contents.push({
            role: 'user',
            parts: [{ text: String(lastMsg?.content || 'Xin chào') }]
        });
    }

    return contents;
}

async function callGeminiEndpoint(endpoint, payload) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        const error = new Error(`Gemini API lỗi HTTP ${response.status}: ${errText.slice(0, 180)}`);
        error.status = response.status;
        throw error;
    }

    const result = await response.json();
    const candidate = result.candidates?.[0];
    const textPart = candidate?.content?.parts?.[0]?.text;

    if (!textPart) {
        throw new Error('Gemini không trả về nội dung hợp lệ.');
    }

    let answer = String(textPart).trim();
    const thinkingEnd = answer.lastIndexOf('</think>');
    if (thinkingEnd >= 0) {
        answer = answer.slice(thinkingEnd + '</think>'.length).trim();
    }
    answer = answer.replace(/\p{Script=Han}/gu, '').replace(/[ \t]{2,}/g, ' ').trim();
    return answer;
}

async function getGeminiChatCompletion(systemPrompt, messages) {
    const { apiKey, model } = getGeminiConfig();
    if (!apiKey) {
        throw new Error('Chưa cấu hình GEMINI_API_KEY trong file .env');
    }

    const contents = formatMessagesForGemini(messages);
    const payload = {
        contents,
        generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 280
        }
    };

    if (systemPrompt) {
        payload.system_instruction = {
            parts: [{ text: systemPrompt }]
        };
    }

    // Danh sách các model fallback dự phòng theo thứ tự tốc độ
    const candidateModels = [
        model,
        'gemini-3.5-flash-lite',
        'gemini-3.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-1.5-flash'
    ].filter((m, i, arr) => m && arr.indexOf(m) === i);

    let lastError = null;
    for (const m of candidateModels) {
        try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${apiKey}`;
            return await callGeminiEndpoint(endpoint, payload);
        } catch (err) {
            lastError = err;
            if (err.status === 404) {
                continue;
            }
            throw err;
        }
    }

    throw lastError || new Error('Không thể kết nối Gemini API.');
}

module.exports = {
    getGeminiChatCompletion,
    isGeminiAvailable,
    getGeminiConfig
};
