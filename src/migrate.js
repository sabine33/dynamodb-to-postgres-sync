"use strict";

const { ScanCommand } = require("@aws-sdk/client-dynamodb");
const { quoteIdentifier, normalizeName } = require("./naming");
const { decodeDynamoItem } = require("./dynamoTypes");

// ============================================================
// SCAN ALL ITEMS (paginated)
// ============================================================

async function scanAllItems(ddb, tableName, pageSize) {
    const items = [];
    let ExclusiveStartKey;

    do {
        const result = await ddb.send(
            new ScanCommand({
                TableName: tableName,
                Limit: pageSize,
                ExclusiveStartKey,
            })
        );

        if (result.Items) items.push(...result.Items);
        ExclusiveStartKey = result.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    return items;
}

// ============================================================
// VALUE CONVERSION
// ============================================================

function postgresValue(value) {
    if (value === undefined || value === null) return null;

    if (typeof value === "object" && !Buffer.isBuffer(value)) {
        return JSON.stringify(value);
    }

    return value;
}

// ============================================================
// UPSERT ONE ITEM
// ============================================================

async function upsertItem(pg, pgSchema, dynamoTableName, rawItem, primaryKeys) {
    const schema = quoteIdentifier(pgSchema);
    const table = quoteIdentifier(normalizeName(dynamoTableName));

    const item = decodeDynamoItem(rawItem);
    const columns = Object.keys(item);
    if (columns.length === 0) return;

    const quotedColumns = columns.map(quoteIdentifier).join(", ");
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    const values = columns.map((column) => postgresValue(item[column]));

    const primaryKeySet = new Set(primaryKeys.map((k) => k.name));
    const primaryKeyColumns = primaryKeys
        .map((k) => quoteIdentifier(k.name))
        .join(", ");
    const updateColumns = columns.filter((c) => !primaryKeySet.has(c));

    let conflictSQL;

    if (updateColumns.length > 0) {
        conflictSQL = `
            DO UPDATE SET
            ${updateColumns
                .map((c) => `${quoteIdentifier(c)} = EXCLUDED.${quoteIdentifier(c)}`)
                .join(",\n            ")}
        `;
    } else {
        conflictSQL = "DO NOTHING";
    }

    const sql = `
        INSERT INTO ${schema}.${table} (${quotedColumns})
        VALUES (${placeholders})
        ON CONFLICT (${primaryKeyColumns})
        ${conflictSQL};
    `;

    await pg.query(sql, values);
}

// ============================================================
// MIGRATE ALL ITEMS
// ============================================================

async function migrateItems(
    pg,
    pgSchema,
    dynamoTableName,
    rawItems,
    primaryKeys,
    onProgress
) {
    let count = 0;

    for (const rawItem of rawItems) {
        await upsertItem(pg, pgSchema, dynamoTableName, rawItem, primaryKeys);
        count++;

        if (onProgress && count % 100 === 0) {
            onProgress(count, rawItems.length);
        }
    }

    return count;
}

module.exports = { scanAllItems, upsertItem, migrateItems, postgresValue };