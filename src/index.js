"use strict";

const { promptForConfig } = require("./prompts");
const { createDynamoClient, createPgClient } = require("./clients");
const { checkDynamoConnection, checkPgConnection } = require("./checkConnections");
const { listAllDynamoTables, promptTableSelection } = require("./tables");
const {
    ensureSchema,
    getDynamoMetadata,
    getPrimaryKeys,
    createTableIfMissing,
    ensureColumnsExist,
} = require("./schema");
const { scanAllItems, migrateItems } = require("./migrate");
const { startReplication } = require("./stream");
const { printReport } = require("./report");

// ============================================================
// MIGRATE ONE TABLE (isolated — errors here never bubble up
// and stop the other tables)
// ============================================================

async function migrateOneTable(ddb, pg, config, dynamoTableName) {
    const start = Date.now();

    const tableMetadata = await getDynamoMetadata(ddb, dynamoTableName);
    const primaryKeys = getPrimaryKeys(tableMetadata);

    console.log(`\n📥 [${dynamoTableName}] Scanning...`);
    const rawItems = await scanAllItems(ddb, dynamoTableName, config.scanPageSize);
    console.log(`📦 [${dynamoTableName}] Retrieved ${rawItems.length} item(s)`);

    const { created, pgTableName } = await createTableIfMissing(
        pg,
        config.pgSchema,
        dynamoTableName,
        tableMetadata,
        rawItems
    );

    console.log(
        created
            ? `🛠  [${dynamoTableName}] Created PostgreSQL table ${config.pgSchema}.${pgTableName}`
            : `✅ [${dynamoTableName}] PostgreSQL table already exists: ${config.pgSchema}.${pgTableName}`
    );

    let columnsAdded = [];
    if (rawItems.length > 0) {
        columnsAdded = await ensureColumnsExist(pg, config.pgSchema, dynamoTableName, rawItems);
    }

    console.log(`🚚 [${dynamoTableName}] Migrating ${rawItems.length} item(s)...`);
    const migratedCount = await migrateItems(
        pg,
        config.pgSchema,
        dynamoTableName,
        rawItems,
        primaryKeys,
        (count, total) => console.log(`   [${dynamoTableName}] ${count}/${total}`)
    );

    const durationMs = Date.now() - start;

    return {
        table: dynamoTableName,
        status: "success",
        itemsMigrated: migratedCount,
        columnsAdded,
        durationMs,
        primaryKeys,
        streamArn: tableMetadata.LatestStreamArn,
    };
}

// ============================================================
// MAIN
// ============================================================

async function run() {
    console.log("==============================================");
    console.log(" DynamoDB -> PostgreSQL Replicator");
    console.log("==============================================\n");

    const config = await promptForConfig();

    const ddb = createDynamoClient(config);
    const pg = createPgClient(config);

    console.log("\n🔎 Checking connections...");

    const dynamoCheck = await checkDynamoConnection(ddb);
    if (!dynamoCheck.ok) {
        console.error("❌ Could not connect to DynamoDB:", dynamoCheck.error.message);
        process.exit(1);
    }
    console.log("✅ DynamoDB connection OK");

    const pgCheck = await checkPgConnection(pg);
    if (!pgCheck.ok) {
        console.error("❌ Could not connect to PostgreSQL:", pgCheck.error.message);
        process.exit(1);
    }
    console.log("✅ PostgreSQL connection OK");

    await ensureSchema(pg, config.pgSchema);
    console.log(`✅ PostgreSQL schema verified: ${config.pgSchema}`);

    console.log("\n📋 Listing DynamoDB tables...");
    const allTables = await listAllDynamoTables(ddb);

    if (allTables.length === 0) {
        console.log("No DynamoDB tables found. Nothing to do.");
        await pg.end();
        return;
    }

    console.log(`Found ${allTables.length} table(s): ${allTables.join(", ")}`);

    const selectedTables = await promptTableSelection(allTables);

    console.log(
        `\n▶️  Migrating ${selectedTables.length} table(s): ${selectedTables.join(", ")}\n`
    );

    const results = [];

    // ---- Each table is fully isolated: a failure here never
    // ---- prevents the remaining tables from being processed.
    for (const tableName of selectedTables) {
        try {
            const result = await migrateOneTable(ddb, pg, config, tableName);
            results.push(result);
        } catch (error) {
            console.error(`❌ [${tableName}] Migration failed:`, error.message);
            results.push({
                table: tableName,
                status: "failed",
                error: error.message,
            });
        }
    }

    printReport(results);

    if (!config.enableStreaming) {
        console.log("CDC replication not enabled. Exiting.");
        await pg.end();
        return;
    }

    const successfulTables = results.filter((r) => r.status === "success");

    if (successfulTables.length === 0) {
        console.log("No successfully migrated tables to stream. Exiting.");
        await pg.end();
        return;
    }

    console.log("\n📡 Starting continuous CDC replication (Ctrl+C to stop)...\n");

    await Promise.all(
        successfulTables.map((r) =>
            startReplication(
                ddb,
                pg,
                config.pgSchema,
                r.table,
                r.streamArn,
                r.primaryKeys,
                config.pollIntervalMs
            ).catch((error) => {
                console.error(`❌ [${r.table}] CDC replication crashed:`, error.message);
            })
        )
    );
}

process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down...");
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n🛑 Shutting down...");
    process.exit(0);
});

module.exports = { run };