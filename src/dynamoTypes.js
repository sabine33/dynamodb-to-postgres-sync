"use strict";

const { normalizeName } = require("./naming");

// ============================================================
// DYNAMODB TYPE -> POSTGRES TYPE
// ============================================================

function dynamoTypeToPostgres(type) {
    switch (type) {
        case "S":
            return "TEXT";
        case "N":
            return "NUMERIC";
        case "BOOL":
            return "BOOLEAN";
        case "NULL":
            return "BOOLEAN";
        case "M":
        case "L":
        case "SS":
        case "NS":
        case "BS":
        case "B":
            return "JSONB";
        default:
            return "TEXT";
    }
}

// ============================================================
// DYNAMODB VALUE DECODER
// ============================================================

function decodeDynamoValue(value) {
    if (!value || typeof value !== "object") {
        return value;
    }

    if (value.S !== undefined) return value.S;
    if (value.N !== undefined) return Number(value.N);
    if (value.BOOL !== undefined) return value.BOOL;
    if (value.NULL !== undefined) return null;
    if (value.B !== undefined) return value.B;
    if (value.SS !== undefined) return value.SS;
    if (value.NS !== undefined) return value.NS.map(Number);
    if (value.BS !== undefined) return value.BS;
    if (value.L !== undefined) return value.L.map(decodeDynamoValue);

    if (value.M !== undefined) {
        const result = {};
        for (const [key, nestedValue] of Object.entries(value.M)) {
            result[key] = decodeDynamoValue(nestedValue);
        }
        return result;
    }

    return value;
}

function decodeDynamoItem(item) {
    const result = {};
    for (const [key, value] of Object.entries(item)) {
        result[normalizeName(key)] = decodeDynamoValue(value);
    }
    return result;
}

function inferPostgresType(dynamoValue) {
    if (!dynamoValue) return "TEXT";
    const type = Object.keys(dynamoValue)[0];
    return dynamoTypeToPostgres(type);
}

module.exports = {
    dynamoTypeToPostgres,
    decodeDynamoValue,
    decodeDynamoItem,
    inferPostgresType,
};