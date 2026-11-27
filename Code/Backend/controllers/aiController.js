const { getOllamaChatCompletion } = require('../services/ollamaChat');
const { getGeminiChatCompletion, isGeminiAvailable } = require('../services/geminiChat');
const { getInstantReply } = require('../services/quickAiReplies');
const { getAvailableLecturerPoolTopics } = require('../services/lecturerPoolTopics');

const limitText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
const MAX_POOL_TOPIC_CONTEXT = 6;
const ignoredTopicTerms = new Set([
    'cac', 'cho', 'cua', 'de', 'dang', 'duoc', 'em', 'gi', 'hoc', 'la', 'lam',
    'minh', 'mot', 'nao', 'nen', 'nhung', 'tai', 'theo', 'thi', 'toi', 'trong',
    'va', 've', 'voi'
]);

function normalizeTopicSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .toLowerCase();
}

function selectRelevantPoolTopics(poolTopics, query) {
    const terms = [...new Set(normalizeTopicSearchText(query).match(/[a-z0-9]+/g) || [])]
        .filter(term => term.length > 2 && !ignoredTopicTerms.has(term));

    return poolTopics
        .map((topic, index) => {
            const title = normalizeTopicSearchText(topic.title);
            const details = normalizeTopicSearchText([
                topic.description,
                topic.requirements,
                topic.category
            ].join(' '));
            const score = terms.reduce((total, term) =>
                total + (title.includes(term) ? 3 : details.includes(term) ? 1 : 0), 0);
            return { topic, index, score };
        })
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, MAX_POOL_TOPIC_CONTEXT)
        .map(item => item.topic);
}

function needsTopicContext(query) {
    const normalized = normalizeTopicSearchText(query);
    return /\b(de tai|y tuong|goi y|chon|nganh|linh vuc|ky nang|so thich|thich|cong nghe|du an|he thong|web|app|ai|du lieu|phan tich|dashboard|phat trien|xay dung)\b/.test(normalized);
}

function getQuickReply(message) {
    // Ưu tiên bộ phản hồi nhanh toàn diện Tầng 1
    const instant = getInstantReply(message);
    if (instant) return instant;

    const normalized = normalizeTopicSearchText(message)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const gratitude = /\b(?:cam on|thanks|thank you|thx|tks|ty)\b/.test(normalized);
    const remaining = normalized
        .replace(/\b(?:cam on|thanks|thank you|thx|tks|ty)\b/g, ' ')
        .replace(/\b(?:a|ban|b|da|duoc|iu|k|kiu|love|na|nha|nhe|nhiu|nhieu|oke|ok|okay|roi|u|vang|yeu)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (gratitude && !remaining) {
        return 'Không có gì nha! Nếu cần, bạn cứ hỏi mình thêm về các đề tài nhé ✨';
    }
    if (/^(?:hi|hello|hey|alo|chao|chao ban|ban oi)$/.test(normalized)) {
        return 'Chào bạn! Mình là Peanuts, mình có thể giúp bạn tìm hiểu đề tài hoặc hướng dẫn dùng hệ thống.';
    }
    if (/^(?:(?:da|oke|ok|okay|roi|duoc|vang|um|uh)[\s,]*)+(?:(?:ban|nha|nhe)[\s,]*)?$/.test(normalized)) {
        return 'Dạ, khi nào cần tư vấn đề tài hay hướng dẫn dùng hệ thống thì cứ nhắn mình nhé ✨';
    }
    return null;
}

const studentWorkflowGuide = `QUY TRÌNH HỆ THỐNG:
- ĐĂNG KÝ ĐỀ TÀI: Vào "Đăng ký đề tài". Trưởng nhóm: chọn GVHD, thêm mã MSSV thành viên (nếu có), chọn đề tài GV gợi ý hoặc nhập đề tài mới; nhấn "Gửi Đăng Ký Đề Tài". Thành viên: nhập MSSV Trưởng nhóm để gửi yêu cầu gia nhập.
- NỘP BÁO CÁO: Vào "Đề tài của tôi" (sau khi GV duyệt đề tài). Trong mốc mở, chọn "Thêm bài nộp" -> "Thêm tệp" (PDF, DOC, DOCX, ZIP, RAR tối đa 25MB) -> nhấn "Lưu thay đổi" rồi nhấn "Nộp bài".
- THỜI HẠN: Xem thông báo trên trang Đăng ký đề tài hoặc xem chi tiết mốc tại Đề tài của tôi.
- ADMIN / TÁC GIẢ WEBSITE: Nếu sinh viên hỏi admin/chủ/người tạo ra/người code trang web này là ai, trả lời đáng yêu: "Đó chính là anh Võ Văn Phụng đẹp zai của tui đó! Muốn liên hệ thì Zalo: 0362182243, FB: Võ Văn Phụng nha hihi 🥰✨".`;

function buildSystemPrompt(profile, topics) {
    const topicContext = topics.length
        ? JSON.stringify(topics.map(topic => ({
            title: topic.title,
            description: limitText(topic.description, 160),
            category: topic.category,
            availability: topic.remaining_groups > 0 ? 'Còn chỗ' : 'Đã đủ chỗ'
        })))
        : 'Kho hiện chưa có đề tài đang mở.';

    return `Bạn là Peanuts - trợ lý hướng dẫn TTTN cho sinh viên. Trả lời trực tiếp bằng tiếng Việt, thân thiện, ngắn gọn (dưới 150 từ), không dùng markdown hoa mỹ.
Hồ sơ SV: ngành=${profile.major || 'chưa rõ'}; kỹ năng=${profile.skills || 'chưa rõ'}; sở thích=${profile.interests || 'chưa rõ'}.
${studentWorkflowGuide}
Đề tài tham khảo: ${topicContext}
Nếu SV hỏi gợi ý đề tài: đề xuất 1-2 hướng phù hợp ngành/kỹ năng, nêu công nghệ cần chuẩn bị. Tuyệt đối không tự suy luận nội bộ, không dùng tiếng Trung/Nhật/Anh dài dòng, chỉ xuất câu trả lời cho sinh viên.`;
}

exports.chatWithStudentAdvisor = async (req, res) => {
    const message = limitText(req.body?.message, 1200);
    if (!message) {
        return res.status(400).json({ success: false, message: 'Hãy nhập câu hỏi cho trợ lý AI.' });
    }
    const profile = {
        major: limitText(req.body?.profile?.major, 100),
        skills: limitText(req.body?.profile?.skills, 300),
        interests: limitText(req.body?.profile?.interests, 300)
    };
    const history = Array.isArray(req.body?.history)
        ? req.body.history.slice(-4).filter(item =>
            item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string' &&
            !(item.role === 'assistant' && item.content.startsWith('Bạn chưa cho mình biết ngành đang học.'))
        ).map(item => ({ role: item.role, content: limitText(item.content, 600) }))
        : [];

    try {
        // TẦNG 1: PHẢN HỒI NHANH TỨC THÌ (Dưới 0.01s - Không tốn tài nguyên, không gọi API)
        const quickReply = getQuickReply(message);
        if (quickReply) {
            return res.status(200).json({
                success: true,
                reply: quickReply,
                provider: 'instant'
            });
        }

        const topicQuery = [
            message,
            profile.major,
            profile.skills,
            profile.interests,
            ...history.map(item => item.content)
        ].join(' ');
        const poolTopics = needsTopicContext(topicQuery)
            ? selectRelevantPoolTopics(await getAvailableLecturerPoolTopics(), topicQuery)
            : [];
        
        const systemPrompt = buildSystemPrompt(profile, poolTopics);
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: message }
        ];

        // TẦNG 2: GOOGLE GEMINI FLASH CLOUD (Siêu tốc ~0.5s - 1s nếu có cấu hình GEMINI_API_KEY)
        if (isGeminiAvailable()) {
            try {
                const geminiReply = await getGeminiChatCompletion(systemPrompt, [...history, { role: 'user', content: message }]);
                if (geminiReply) {
                    return res.status(200).json({
                        success: true,
                        reply: geminiReply,
                        provider: 'gemini-flash'
                    });
                }
            } catch (geminiError) {
                console.warn('⚠️ Gemini Flash không phản hồi kịp hoặc lỗi, tự động chuyển sang Ollama dự phòng:', geminiError.message);
                if (process.env.NODE_ENV === 'production') {
                    return res.status(200).json({
                        success: true,
                        reply: 'Hiện tại hệ thống AI đang có lượng truy cập cao. Bạn vui lòng thử lại sau giây lát, hoặc xem hướng dẫn tại mục "Tài liệu & Biểu mẫu" nhé ✨',
                        provider: 'fallback'
                    });
                }
            }
        }

        // TẦNG 3: OLLAMA NỘI BỘ DỰ PHÒNG (qwen2.5:1.5b đã tối ưu prompt)
        const reply = await getOllamaChatCompletion(messages);
        return res.status(200).json({
            success: true,
            reply,
            provider: 'ollama'
        });
    } catch (error) {
        console.error('Lỗi tư vấn đề tài bằng AI:', error.message);
        return res.status(200).json({
            success: true,
            reply: 'Hiện tại Peanuts đang tạm bận một chút hoặc đường truyền AI gián đoạn. Bạn vui lòng thử lại sau giây lát nhé ✨',
            provider: 'fallback'
        });
    }
};
