"use strict";

function printReport(results) {
    console.log("\n==============================================");
    console.log(" MIGRATION REPORT");
    console.log("==============================================");

    const succeeded = results.filter((r) => r.status === "success");
    const failed = results.filter((r) => r.status === "failed");

    for (const r of results) {
        if (r.status === "success") {
            const cols = r.columnsAdded && r.columnsAdded.length
                ? ` | columns added: ${r.columnsAdded.join(", ")}`
                : "";
            console.log(
                `✅ ${r.table}: ${r.itemsMigrated} item(s) migrated in ${r.durationMs}ms${cols}`
            );
        } else {
            console.log(`❌ ${r.table}: FAILED - ${r.error}`);
        }
    }

    console.log("----------------------------------------------");
    console.log(
        `Total: ${results.length} | Success: ${succeeded.length} | Failed: ${failed.length}`
    );
    console.log("==============================================\n");
}

module.exports = { printReport };