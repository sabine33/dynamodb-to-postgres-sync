"use strict";

const { DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const { quoteIdentifier, normalizeName } = require("./naming");
const { dynamoTypeToPostgres, inferPostgresType } = require("./dynamoTypes");

// ============================================================
// SCHEMA
// ============================================================

async function ensureSchema(pg, pgSchema) {
    const schema = quoteIdentifier(pgSchema);
    await pg.query(`CREATE SCHEMA IF NOT EXISTS ${schema};`);
}

// ============================================================
// DYNAMODB TABLE METADATA
// ============================================================

async function getDynamoMetadata(ddb, tableName) {
    const result = await ddb.send(
        new DescribeTableCommand({ TableName: tableName })
    );

    if (!result.Table) {
        throw new Error(`DynamoDB table "${tableName}" was not found`);
    }

    return result.Table;
}

function getPrimaryKeys(tableMetadata) {
    const keySchema = tableMetadata.KeySchema || [];
    const attrDefs = tableMetadata.AttributeDefinitions || [];
    const keys = [];

    for (const key of keySchema) {
        const attr = attrDefs.find((a) => a.AttributeName === key.AttributeName);

        if (!attr) {
            throw new Error(
                `Unable to find AttributeDefinition for ${key.AttributeName}`
            );
        }

        keys.push({
            name: normalizeName(key.AttributeName),
            originalName: key.AttributeName,
            keyType: key.KeyType,
            dynamoType: attr.AttributeType,
            postgresType: dynamoTypeToPostgres(attr.AttributeType),
        });
    }

    return keys;
}

// ============================================================
// TABLE EXISTENCE CHECK
// ============================================================

async function tableExistsInPg(pg, pgSchema, pgTableName) {
    const result = await pg.query(
        `
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = $1 AND table_name = $2
        ) AS exists;
        `,
        [pgSchema, pgTableName]
    );

    return result.rows[0].exists;
}

// ============================================================
// CREATE TABLE IF MISSING
// ============================================================

async function createTableIfMissing(
    pg,
    pgSchema,
    dynamoTableName,
    tableMetadata,
    sampleItems
) {
    const schema = quoteIdentifier(pgSchema);
    const pgTableName = normalizeName(dynamoTableName);
    const table = quoteIdentifier(pgTableName);

    const exists = await tableExistsInPg(pg, pgSchema, pgTableName);

    if (exists) {
        return { created: false, pgTableName };
    }

    const keys = getPrimaryKeys(tableMetadata);
    const attributes = new Map();

    for (const key of keys) {
        attributes.set(key.name, { type: key.postgresType, isKey: true });
    }

    for (const item of sampleItems) {
        for (const [attributeName, dynamoValue] of Object.entries(item)) {
            const columnName = normalizeName(attributeName);
            if (attributes.has(columnName)) continue;

            attributes.set(columnName, {
                type: inferPostgresType(dynamoValue),
                isKey: false,
            });
        }
    }

    const columns = [];

    for (const [columnName, metadata] of attributes) {
        let definition = `${quoteIdentifier(columnName)} ${metadata.type}`;
        if (metadata.isKey) definition += " NOT NULL";
        columns.push(definition);
    }

    if (columns.length === 0) {
        throw new Error(
            "Unable to infer schema because DynamoDB contains no records and no usable key definition was found."
        );
    }

    const primaryKeyColumns = keys.map((k) => quoteIdentifier(k.name)).join(", ");
    columns.push(`PRIMARY KEY (${primaryKeyColumns})`);

    const createSQL = `
        CREATE TABLE ${schema}.${table} (
            ${columns.join(",\n            ")}
        );
    `;

    await pg.query(createSQL);

    return { created: true, pgTableName };
}

// ============================================================
// ALTER TABLE FOR NEW ATTRIBUTES
// ============================================================

async function ensureColumnsExist(pg, pgSchema, dynamoTableName, rawItems) {
    const schema = quoteIdentifier(pgSchema);
    const pgTableName = normalizeName(dynamoTableName);
    const table = quoteIdentifier(pgTableName);

    const result = await pg.query(
        `
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2;
        `,
        [pgSchema, pgTableName]
    );

    const existingColumns = new Set(result.rows.map((row) => row.column_name));
    const newColumns = new Map();

    for (const rawItem of rawItems) {
        for (const [attributeName, dynamoValue] of Object.entries(rawItem)) {
            const columnName = normalizeName(attributeName);
            if (existingColumns.has(columnName)) continue;

            if (!newColumns.has(columnName)) {
                newColumns.set(columnName, inferPostgresType(dynamoValue));
            }
        }
    }

    const addedColumns = [];

    for (const [columnName, postgresType] of newColumns) {
        await pg.query(`
            ALTER TABLE ${schema}.${table}
            ADD COLUMN IF NOT EXISTS ${quoteIdentifier(columnName)} ${postgresType};
        `);
        addedColumns.push(columnName);
    }

    return addedColumns;
}

module.exports = {
    ensureSchema,
    getDynamoMetadata,
    getPrimaryKeys,
    createTableIfMissing,
    ensureColumnsExist,
};