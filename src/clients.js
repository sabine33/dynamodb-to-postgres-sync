"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { Client } = require("pg");

function createDynamoClient(config) {
    return new DynamoDBClient({
        endpoint: config.dynamoEndpoint,
        region: config.region,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    });
}

function createPgClient(config) {
    return new Client({
        connectionString: config.pgConnectionString,
    });
}

module.exports = { createDynamoClient, createPgClient };