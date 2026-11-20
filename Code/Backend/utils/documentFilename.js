function decodeLegacyFilename(value) {
    const filename = String(value || '');
    if (!/[ÃÂ]/.test(filename)) return filename;

    const characters = Array.from(filename);
    if (characters.some(character => character.codePointAt(0) > 255)) return filename;

    const decoded = Buffer.from(characters.map(character => character.codePointAt(0))).toString('utf8');
    return decoded.includes('\uFFFD') ? filename : decoded;
}

function normalizeDocumentFilename(document) {
    const value = typeof document.toObject === 'function' ? document.toObject() : document;
    return {
        ...value,
        original_name: decodeLegacyFilename(value.original_name)
    };
}

module.exports = { decodeLegacyFilename, normalizeDocumentFilename };
