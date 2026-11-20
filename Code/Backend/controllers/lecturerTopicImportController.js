const ExcelJS = require('exceljs');
const LecturerTopic = require('../models/LecturerTopic');
const { getLecturerQuotaStatus } = require('../services/lecturerQuota');

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_ROWS = 100;
const CATEGORIES = ['Web / Ứng dụng', 'AI / ML', 'Dữ liệu / Phân tích', 'Khác'];
const TEMPLATE_HEADERS = ['Tên đề tài', 'Mô tả', 'Lĩnh vực', 'Yêu cầu đầu vào'];
const FIELD_ALIASES = {
    title: ['tendetai', 'title'],
    description: ['mota', 'motachitiet', 'description'],
    category: ['linhvuc', 'category'],
    requirements: ['yeucauvaodau', 'requirements']
};
const REQUIRED_FIELDS = ['title', 'description'];

const normalizeHeader = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const normalizeTitle = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function getCellText(cell) {
    const value = cell.value;
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value).trim();
    }
    if (typeof value === 'object' && Array.isArray(value.richText)) {
        return value.richText.map(part => part.text || '').join('').trim();
    }
    if (typeof value === 'object' && typeof value.text === 'string' && !value.formula) {
        return value.text.trim();
    }
    return '';
}

function normalizeCategory(value) {
    const normalized = normalizeHeader(value);
    const byAlias = {
        webungdung: 'Web / Ứng dụng',
        webungdungdidong: 'Web / Ứng dụng',
        aiml: 'AI / ML',
        aimachinelearning: 'AI / ML',
        dulieuphantich: 'Dữ liệu / Phân tích',
        dulieuphantichdulieu: 'Dữ liệu / Phân tích',
        khac: 'Khác'
    };
    return byAlias[normalized] || CATEGORIES.find(category => normalizeHeader(category) === normalized) || '';
}

async function parseLecturerTopicFile(file, lecturerCode) {
    if (!file?.buffer?.length) return { error: 'Vui lòng chọn file Excel.' };
    if (!String(file.originalname || '').toLowerCase().endsWith('.xlsx')) {
        return { error: 'Chỉ hỗ trợ file Excel .xlsx.' };
    }
    if (file.buffer.length > MAX_FILE_SIZE) return { error: 'File Excel không được vượt quá 2 MB.' };

    let worksheet;
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(file.buffer, { ignoreNodes: ['tableParts'] });
        worksheet = workbook.worksheets[0];
    } catch (error) {
        console.error('Không thể đọc file import đề tài:', error.message);
        return { error: 'File Excel bị lỗi hoặc không đúng định dạng.' };
    }
    if (!worksheet) return { error: 'File Excel không có trang tính dữ liệu.' };

    const headerIndexes = new Map();
    worksheet.getRow(1).eachCell((cell, columnNumber) => {
        const normalized = normalizeHeader(getCellText(cell));
        if (normalized) headerIndexes.set(normalized, columnNumber);
    });
    const fieldIndexes = {};
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        fieldIndexes[field] = aliases.map(alias => headerIndexes.get(alias))
            .find(index => index !== undefined);
    }
    const missingHeaders = REQUIRED_FIELDS.filter(field => fieldIndexes[field] === undefined);
    if (missingHeaders.length) {
        const labels = { title: 'Tên đề tài', description: 'Mô tả' };
        return { error: `File thiếu cột bắt buộc: ${missingHeaders.map(field => labels[field]).join(', ')}.` };
    }

    const candidates = [];
    worksheet.eachRow({ includeEmpty: false }, (excelRow, rowNumber) => {
        if (rowNumber === 1) return;
        const row = { rowNumber };
        Object.entries(fieldIndexes).forEach(([field, columnNumber]) => {
            row[field] = columnNumber ? getCellText(excelRow.getCell(columnNumber)) : '';
        });
        if (Object.values(row).some(value => typeof value === 'string' && value.trim())) {
            candidates.push(row);
        }
    });
    if (!candidates.length) return { error: 'File Excel chưa có dòng đề tài nào.' };
    if (candidates.length > MAX_ROWS) {
        return { error: `Mỗi lần chỉ nhập tối đa ${MAX_ROWS} đề tài.` };
    }

    const existingTopics = await LecturerTopic.find({
        lecturer_code: new RegExp(`^${escapeRegex(lecturerCode)}$`, 'i'),
        status: { $ne: 'REJECTED' },
        is_active: { $ne: false }
    }).select('title').lean();
    const existingTitles = new Set(existingTopics.map(topic => normalizeTitle(topic.title)));
    const seenTitles = new Set();
    const rows = candidates.map(candidate => {
        const row = {
            rowNumber: candidate.rowNumber,
            title: candidate.title,
            description: candidate.description,
            category: candidate.category ? normalizeCategory(candidate.category) : 'Web / Ứng dụng',
            requirements: candidate.requirements,
            errors: []
        };
        if (!row.title) row.errors.push('Thiếu tên đề tài.');
        else if (row.title.length > 200) row.errors.push('Tên đề tài không được vượt quá 200 ký tự.');
        if (!row.description) row.errors.push('Thiếu mô tả đề tài.');
        else if (row.description.length > 3000) row.errors.push('Mô tả không được vượt quá 3000 ký tự.');
        if (row.requirements.length > 1000) row.errors.push('Yêu cầu đầu vào không được vượt quá 1000 ký tự.');
        if (candidate.category && !row.category) row.errors.push('Lĩnh vực không hợp lệ.');

        const titleKey = normalizeTitle(row.title);
        if (titleKey && seenTitles.has(titleKey)) row.errors.push('Tên đề tài bị trùng trong file.');
        if (titleKey && existingTitles.has(titleKey)) row.errors.push('Đề tài đã có trong kho của bạn.');
        if (titleKey) seenTitles.add(titleKey);
        row.valid = row.errors.length === 0;
        return row;
    });

    return {
        rows,
        validRows: rows.filter(row => row.valid),
        errors: rows.filter(row => !row.valid),
        totalRows: rows.length
    };
}

exports.downloadLecturerTopicTemplate = async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Danh sách đề tài');
        worksheet.addRow(TEMPLATE_HEADERS);
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        worksheet.columns = [
            { width: 38 },
            { width: 60 },
            { width: 26 },
            { width: 42 }
        ];
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];

        const guide = workbook.addWorksheet('Hướng dẫn');
        guide.addRows([
            ['Hướng dẫn nhập danh sách đề tài'],
            ['Điền dữ liệu ở sheet "Danh sách đề tài"; mỗi dòng là một đề tài.'],
            ['Tên đề tài và Mô tả là bắt buộc.'],
            ['Lĩnh vực: Web / Ứng dụng, AI / ML, Dữ liệu / Phân tích hoặc Khác.'],
            ['Yêu cầu đầu vào không bắt buộc. Không cần nhập mã giảng viên.'],
            [`Tối đa ${MAX_ROWS} đề tài mỗi lần; file .xlsx không vượt quá 2 MB.`]
        ]);
        guide.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };
        guide.getColumn(1).width = 95;

        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="mau-import-de-tai.xlsx"');
        return res.send(Buffer.from(buffer));
    } catch (error) {
        console.error('Lỗi tạo file mẫu import đề tài:', error.message);
        return res.status(500).json({ success: false, message: 'Không thể tạo file Excel mẫu.' });
    }
};

exports.previewLecturerTopicImport = async (req, res) => {
    try {
        const lecturerCode = String(req.user?.user_code || '').trim();
        const result = await parseLecturerTopicFile(req.file, lecturerCode);
        if (result.error) return res.status(400).json({ success: false, message: result.error });

        return res.json({
            success: true,
            data: {
                total_rows: result.totalRows,
                valid_count: result.validRows.length,
                error_count: result.errors.length,
                rows: result.rows
            }
        });
    } catch (error) {
        console.error('Lỗi kiểm tra file import đề tài:', error.message);
        return res.status(500).json({ success: false, message: 'Không thể kiểm tra file Excel.' });
    }
};

exports.importLecturerTopics = async (req, res) => {
    try {
        const lecturerCode = String(req.user?.user_code || '').trim();
        const result = await parseLecturerTopicFile(req.file, lecturerCode);
        if (result.error) return res.status(400).json({ success: false, message: result.error });
        if (!result.validRows.length) {
            return res.status(400).json({
                success: false,
                message: 'Không có đề tài hợp lệ để import.',
                data: { total_rows: result.totalRows, imported_count: 0, errors: result.errors }
            });
        }

        const quotaStatus = await getLecturerQuotaStatus(lecturerCode);
        if (!quotaStatus.found) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin chỉ tiêu của giảng viên.' });
        }
        if (quotaStatus.quota < 1) {
            return res.status(400).json({
                success: false,
                message: 'Chỉ tiêu tổng của bạn đang bằng 0. Vui lòng liên hệ Admin để tăng chỉ tiêu trước.'
            });
        }

        const topics = result.validRows.map(row => ({
            lecturer_code: lecturerCode,
            title: row.title,
            description: row.description,
            category: row.category,
            requirements: row.requirements,
            max_groups: 1,
            status: 'APPROVED',
            is_active: true,
            feedback: ''
        }));
        const importedTopics = await LecturerTopic.insertMany(topics);
        return res.status(201).json({
            success: true,
            message: `Đã import ${importedTopics.length} đề tài vào kho.`,
            data: {
                total_rows: result.totalRows,
                imported_count: importedTopics.length,
                errors: result.errors
            }
        });
    } catch (error) {
        console.error('Lỗi import đề tài vào kho:', error.message);
        return res.status(500).json({ success: false, message: 'Không thể lưu danh sách đề tài.' });
    }
};

module.exports.MAX_LECTURER_TOPIC_IMPORT_FILE_SIZE = MAX_FILE_SIZE;
