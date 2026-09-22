"use strict";

const {
    DescribeStreamCommand,
    GetShardIteratorCommand,
    GetRecordsCommand,
} = require("@aws-sdk/client-dynamodb");

const { quoteIdentifier, normalizeName } = require("./naming");
const { decodeDynamoItem } = require("./dynamoTypes");
const { ensureColumnsExist } = require("./schema");
const { upsertItem, postgresValue } = require("./migrate");

async function getShards(ddb, streamArn) {
    const result = await ddb.send(
        new DescribeStreamCommand({ StreamArn: streamArn })
    );
    return result.StreamDescription?.Shards || [];
}

async function getIterator(ddb, streamArn, shardId) {
    const result = await ddb.send(
        new GetShardIteratorCommand({
            StreamArn: streamArn,
            ShardId: shardId,
            ShardIteratorType: "TRIM_HORIZON",
        })
    );
    return result.ShardIterator;
}

async function processStreamRecord(pg, pgSchema, dynamoTableName, record, primaryKeys) {
    const eventName = record.eventName;
    if (!record.dynamodb) return;

    const keys = record.dynamodb.Keys || {};
    const rawNewImage = record.dynamodb.NewImage;

    if (eventName === "INSERT" || eventName === "MODIFY") {
        if (!rawNewImage) return;

        await ensureColumnsExist(pg, pgSchema, dynamoTableName, [rawNewImage]);
        await upsertItem(pg, pgSchema, dynamoTableName, rawNewImage, primaryKeys);

        console.log(`   🔄 [${dynamoTableName}] ${eventName} replicated`);
        return;
    }

    if (eventName === "REMOVE") {
        const schema = quoteIdentifier(pgSchema);
        const table = quoteIdentifier(normalizeName(dynamoTableName));
        const decodedKeys = decodeDynamoItem(keys);

        const conditions = [];
        const values = [];
        let index = 1;

        for (const key of primaryKeys) {
            conditions.push(`${quoteIdentifier(key.name)} = $${index}`);
            values.push(postgresValue(decodedKeys[key.name]));
            index++;
        }

        if (conditions.length === 0) return;

        await pg.query(
            `DELETE FROM ${schema}.${table} WHERE ${conditions.join(" AND ")};`,
            values
        );

        console.log(`   🗑 [${dynamoTableName}] REMOVE replicated`);
    }
}

async function processShard(
    ddb,
    pg,
    pgSchema,
    dynamoTableName,
    streamArn,
    shard,
    primaryKeys,
    pollIntervalMs
) {
    let iterator = await getIterator(ddb, streamArn, shard.ShardId);

    while (iterator) {
        const result = await ddb.send(
            new GetRecordsCommand({ ShardIterator: iterator, Limit: 100 })
        );

        for (const record of result.Records || []) {
            try {
                await processStreamRecord(pg, pgSchema, dynamoTableName, record, primaryKeys);
            } catch (error) {
                console.error(
                    `   ❌ [${dynamoTableName}] Failed processing stream record:`,
                    error.message
                );
            }
        }

        iterator = result.NextShardIterator;

        if (!result.Records || result.Records.length === 0) {
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
    }
}

async function startReplication(
    ddb,
    pg,
    pgSchema,
    dynamoTableName,
    streamArn,
    primaryKeys,
    pollIntervalMs
) {
    if (!streamArn) {
        console.warn(
            `   ⚠️  [${dynamoTableName}] DynamoDB Streams are not enabled, skipping CDC.`
        );
        return;
    }

    console.log(`   📡 [${dynamoTableName}] Stream: ${streamArn}`);

    while (true) {
        try {
            const shards = await getShards(ddb, streamArn);

            if (shards.length === 0) {
                await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
                continue;
            }

            await Promise.all(
                shards.map((shard) =>
                    processShard(
                        ddb,
                        pg,
                        pgSchema,
                        dynamoTableName,
                        streamArn,
                        shard,
                        primaryKeys,
                        pollIntervalMs
                    )
                )
            );
        } catch (error) {
            console.error(
                `   ❌ [${dynamoTableName}] Stream processing error:`,
                error.message
            );
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
    }
}

module.exports = { startReplication };