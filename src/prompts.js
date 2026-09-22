"use strict";

const prompts = require("prompts");

const onCancel = () => {
    console.log("\n🛑 Cancelled by user.");
    process.exit(1);
};

async function promptForConfig() {
    const questions = [
        {
            type: "text",
            name: "dynamoEndpoint",
            message: "DynamoDB endpoint",
            initial: process.env.DYNAMO_ENDPOINT || "http://localhost:8000",
        },
        {
            type: "text",
            name: "region",
            message: "AWS region",
            initial: process.env.AWS_REGION || "us-west-2",
        },
        {
            type: "text",
            name: "accessKeyId",
            message: "AWS access key id",
            initial: process.env.AWS_ACCESS_KEY_ID || "mockKey",
        },
        {
            type: "password",
            name: "secretAccessKey",
            message: "AWS secret access key",
            initial: process.env.AWS_SECRET_ACCESS_KEY || "mockSecret",
        },
        {
            type: "text",
            name: "pgConnectionString",
            message: "PostgreSQL connection string",
            initial:
                process.env.PG_CONNECTION_STRING ||
                "postgresql://project_user:project_password@localhost:5432/project_db",
        },
        {
            type: "text",
            name: "pgSchema",
            message: "PostgreSQL schema",
            initial: process.env.PG_SCHEMA || "public",
        },
        {
            type: "number",
            name: "scanPageSize",
            message: "DynamoDB scan page size",
            initial: Number(process.env.SCAN_PAGE_SIZE) || 100,
        },
        {
            type: "number",
            name: "pollIntervalMs",
            message: "Stream poll interval (ms)",
            initial: Number(process.env.POLL_INTERVAL_MS) || 1000,
        },
        {
            type: "confirm",
            name: "enableStreaming",
            message: "Enable continuous CDC replication after initial migration?",
            initial: false,
        },
    ];

    return prompts(questions, { onCancel });
}

module.exports = { promptForConfig, onCancel };