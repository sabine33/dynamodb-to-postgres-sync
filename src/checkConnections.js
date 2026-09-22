"use strict";

const { ListTablesCommand } = require("@aws-sdk/client-dynamodb");

async function checkDynamoConnection(ddb) {
    try {
        await ddb.send(new ListTablesCommand({ Limit: 1 }));
        return { ok: true };
    } catch (error) {
        return { ok: false, error };
    }
}

async function checkPgConnection(pg) {
    try {
        await pg.connect();
        await pg.query("SELECT 1;");
        return { ok: true };
    } catch (error) {
        return { ok: false, error };
    }
}

module.exports = { checkDynamoConnection, checkPgConnection };