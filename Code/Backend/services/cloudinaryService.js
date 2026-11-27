const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

const isCloudinaryConfigured = () => {
    return Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
};

if (isCloudinaryConfigured()) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
}

/**
 * Tải file lên Cloudinary
 * @param {string} filePath - Đường dẫn tệp cục bộ cần tải lên
 * @param {Object} options - Tùy chọn cấu hình
 * @param {string} options.folder - Thư mục trên Cloudinary (VD: 'tttn_submissions', 'tttn_documents')
 * @param {string} options.originalFilename - Tên gốc của tệp
 * @param {boolean} options.removeLocal - Có xóa file local sau khi upload thành công không (mặc định true khi có Cloudinary)
 * @returns {Promise<{ secure_url: string, public_id: string } | null>}
 */
async function uploadFileToCloudinary(filePath, options = {}) {
    if (!isCloudinaryConfigured()) {
        return null;
    }

    const {
        folder = 'tttn_uploads',
        originalFilename = '',
        removeLocal = true
    } = options;

    try {
        const ext = path.extname(originalFilename || filePath).toLowerCase();
        const baseName = path.basename(originalFilename || filePath, ext)
            .replace(/[^a-zA-Z0-9_-]/g, '_');
        const publicId = `${baseName}_${Date.now()}`;

        // Dùng resource_type: 'raw' để hỗ trợ toàn diện mọi loại tệp (.pdf, .docx, .zip, .pptx)
        const uploadResult = await cloudinary.uploader.upload(filePath, {
            folder,
            public_id: publicId,
            resource_type: 'raw',
            use_filename: true
        });

        // Xóa file tạm ở local nếu upload Cloudinary thành công
        if (removeLocal && fs.existsSync(filePath)) {
            fs.unlink(filePath, (err) => {
                if (err) console.error('Lỗi khi xóa file tạm local sau khi đẩy Cloudinary:', err);
            });
        }

        return {
            secure_url: uploadResult.secure_url,
            public_id: uploadResult.public_id
        };
    } catch (error) {
        console.error('Lỗi upload file lên Cloudinary:', error.message);
        // Nếu lỗi tải lên Cloudinary, giữ lại file local để không mất dữ liệu
        return null;
    }
}

/**
 * Xóa file trên Cloudinary theo public_id
 * @param {string} publicId
 * @param {string} resourceType
 */
async function deleteFromCloudinary(publicId, resourceType = 'raw') {
    if (!isCloudinaryConfigured() || !publicId) return;
    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
        console.error('Lỗi xóa file trên Cloudinary:', error.message);
    }
}

module.exports = {
    isCloudinaryConfigured,
    uploadFileToCloudinary,
    deleteFromCloudinary
};
