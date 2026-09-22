#!/usr/bin/env node
"use strict";

const { run } = require("../src/index");

run().catch((error) => {
    console.error("💥 Fatal error:", error);
    process.exit(1);
});