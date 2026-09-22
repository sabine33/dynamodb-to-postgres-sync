"use strict";

// ============================================================
// POSTGRES IDENTIFIER SAFETY
// ============================================================

function quoteIdentifier(identifier) {
    return `"${String(identifier).replace(/"/g, '""')}"`;
}

// Always produces a lower-case, snake_case-safe identifier.
function normalizeName(name) {
    return String(name)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/^(\d)/, "_$1");
}

module.exports = { quoteIdentifier, normalizeName };