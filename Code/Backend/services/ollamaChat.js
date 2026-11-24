function getOllamaConfig() {
    const baseUrl = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
    const configuredModel = String(process.env.OLLAMA_MODEL || '').trim();
    // Mặc định chuyển sang qwen2.5:1.5b (nhẹ, nhanh gấp 3-4 lần so với 3b/4b trên CPU)
    const model = !configuredModel || configuredModel === 'qwen3:4b'
        ? (process.env.OLLAMA_MODEL || 'qwen2.5:1.5b')
        : configuredModel;
    return { baseUrl, model };
}

function extractOllamaAnswer(content) {
    if (typeof content !== 'string') {
        throw new Error('Ollama chưa trả về nội dung hợp lệ.');
    }

    const thinkingEnd = content.lastIndexOf('</think>');
    const rawAnswer = (thinkingEnd >= 0
        ? content.slice(thinkingEnd + '</think>'.length)
        : content).trim();
    const answer = rawAnswer.replace(/\p{Script=Han}/gu, '').replace(/[ \t]{2,}/g, ' ').trim();
    const startsWithReasoning = /^(?:okay(?:,|\s)|hmm\b|the user\b|let me\b|first[,:\s]|looking at\b|i (?:need|should|must|will)\b)/i;

    if (!answer || /<think\b/i.test(answer) || (thinkingEnd < 0 && startsWithReasoning.test(answer))) {
        throw new Error('Ollama chỉ trả về phần phân tích, chưa có câu trả lời cuối cùng.');
    }
    return answer;
}

async function getOllamaChatCompletion(messages) {
    const { baseUrl, model } = getOllamaConfig();
    let response;

    try {
        response = await fetch(new URL('api/chat', `${baseUrl}/`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                stream: false,
                think: false,
                keep_alive: '60m',
                options: { temperature: 0.4, num_predict: 160 }
            }),
            signal: AbortSignal.timeout(60000)
        });
    } catch (error) {
        console.error('Không thể kết nối Ollama:', error.message);
        const serviceError = new Error(
            error.name === 'TimeoutError'
                ? 'Ollama xử lý quá lâu. Vui lòng thử lại hoặc dùng mô hình nhỏ hơn.'
                : 'Không kết nối được Ollama. Hãy mở Ollama trên máy đang chạy backend rồi thử lại.'
        );
        serviceError.statusCode = error.name === 'TimeoutError' ? 504 : 503;
        throw serviceError;
    }

    if (!response.ok) {
        console.error(`Ollama trả về lỗi HTTP ${response.status}.`);
        const serviceError = new Error(
            response.status === 404
                ? `Chưa tìm thấy mô hình ${model}. Hãy tải mô hình bằng lệnh: ollama pull ${model}`
                : 'Ollama đang gặp sự cố. Vui lòng thử lại sau.'
        );
        serviceError.statusCode = 503;
        throw serviceError;
    }

    const result = await response.json();
    return extractOllamaAnswer(result.message?.content);
}

module.exports = { getOllamaChatCompletion, getOllamaConfig, extractOllamaAnswer };
