"use strict";

const prompts = require("prompts");
const { ListTablesCommand } = require("@aws-sdk/client-dynamodb");
const { onCancel } = require("./prompts");

// ============================================================
// LIST ALL DYNAMODB TABLES (paginated)
// ============================================================

async function listAllDynamoTables(ddb) {
    const tables = [];
    let ExclusiveStartTableName;

    do {
        const result = await ddb.send(
            new ListTablesCommand({ ExclusiveStartTableName })
        );

        tables.push(...(result.TableNames || []));
        ExclusiveStartTableName = result.LastEvaluatedTableName;
    } while (ExclusiveStartTableName);

    return tables;
}

// ============================================================
// ASK USER: ALL TABLES OR SPECIFIC ONES
// ============================================================

async function promptTableSelection(tables) {
    if (tables.length === 0) {
        throw new Error("No DynamoDB tables found.");
    }

    const { mode } = await prompts(
        {
            type: "select",
            name: "mode",
            message: "Which tables should be migrated?",
            choices: [
                { title: `All tables (${tables.length})`, value: "all" },
                { title: "Select specific tables", value: "select" },
            ],
        },
        { onCancel }
    );

    if (mode === "all") {
        return tables;
    }

    const { selected } = await prompts(
        {
            type: "multiselect",
            name: "selected",
            message: "Select tables to migrate (space to toggle, enter to confirm)",
            choices: tables.map((t) => ({ title: t, value: t })),
            min: 1,
            instructions: false,
        },
        { onCancel }
    );

    return selected;
}

module.exports = { listAllDynamoTables, promptTableSelection };