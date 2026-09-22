"use strict";

// ============================================================
// POSTGRES IDENTIFIER SAFETY
// ============================================================

function quoteIdentifier(identifier) {
    return `"${String(identifier).replace(/"/g, '""')}"`;
}

// ============================================================
// NORMALIZE NAME -> snake_case, lower-case, Postgres-safe
//
// Examples:
//   qa_UserOrganizations -> qa_user_organizations
//   UserID                -> user_id
//   2FA-Enabled            -> _2fa_enabled
//   already_snake_case     -> already_snake_case
//   HTTPServerError        -> http_server_error
// ============================================================

function normalizeName(name) {
    return String(name)
        .trim()
        // Split "aB" boundaries (lower/digit followed by upper): userID -> user_ID
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        // Split "ABc" boundaries (consecutive uppercase followed by lower):
        // HTTPServer -> HTTP_Server
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
        .toLowerCase()
        // Replace any remaining invalid characters with underscore
        .replace(/[^a-z0-9_]+/g, "_")
        // Collapse multiple underscores into one
        .replace(/_+/g, "_")
        // Trim leading/trailing underscores
        .replace(/^_+|_+$/g, "")
        // Prefix if it starts with a digit (Postgres identifiers can't start with a digit)
        .replace(/^(\d)/, "_$1");
}

module.exports = { quoteIdentifier, normalizeName };