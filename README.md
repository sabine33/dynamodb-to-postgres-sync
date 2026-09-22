# dynamodb-to-pg-sync

Interactive CLI tool to migrate and continuously replicate **DynamoDB** tables into **PostgreSQL** — with connection checks, live table selection, automatic snake_case schema generation, and per-table failure isolation with a full report.

Run it instantly with:

```bash
npx dynamodb-to-pg-sync
```

No installation required.

---

## Features

- 🚀 **Zero-install usage** via `npx dynamodb-to-pg-sync`
- 📝 **Interactive prompts** for every configuration value, pre-filled with sensible defaults
- 🔎 **Connection verification** for both DynamoDB and PostgreSQL right after you answer the prompts
- 📋 **Table discovery** — lists all DynamoDB tables and lets you migrate all of them or hand-pick specific ones
- 🐍 **snake_case columns** — all DynamoDB attribute names are normalized to lower-case snake_case Postgres identifiers
- 🧱 **Automatic schema creation** — infers PostgreSQL column types from DynamoDB attribute types and creates missing tables/columns automatically
- 🔁 **Upserts** — safely re-runnable; uses `ON CONFLICT` to update existing rows
- 🧩 **Per-table isolation** — if one table fails, the others still run; you get a detailed pass/fail report at the end
- 📡 **Optional CDC streaming** — after the initial migration, optionally keep tables in sync in real time via DynamoDB Streams

---

## Requirements

- **Node.js** ≥ 16
- Access to a **DynamoDB** endpoint (AWS or local, e.g. DynamoDB Local)
- Access to a **PostgreSQL** database
- AWS credentials with permissions for:
  - `dynamodb:ListTables`
  - `dynamodb:DescribeTable`
  - `dynamodb:Scan`
  - `dynamodb:DescribeStream` *(only if using CDC streaming)*
  - `dynamodb:GetShardIterator` *(only if using CDC streaming)*
  - `dynamodb:GetRecords` *(only if using CDC streaming)*

---

## Quick Start

Run directly without installing anything:

```bash
npx dynamodb-to-pg-sync
```

You'll be walked through a series of prompts, then the tool will verify connections, list your DynamoDB tables, and let you choose what to migrate.

---

## Installation (optional)

If you prefer a local or global install instead of always using `npx`:

```bash
# Global install
npm install -g dynamodb-to-pg-sync
dynamodb-to-pg-sync

# Or as a dev dependency in a project
npm install --save-dev dynamodb-to-pg-sync
npx dynamodb-to-pg-sync
```

---

## Usage Walkthrough

### 1. Launch the tool

```bash
npx dynamodb-to-pg-sync
```

### 2. Answer the configuration prompts

You'll be asked for the following, each with a default value you can accept by pressing **Enter**:

| Prompt | Description | Default |
|---|---|---|
| `DynamoDB endpoint` | Endpoint URL for DynamoDB (use AWS endpoint or local endpoint) | `http://localhost:8000` |
| `AWS region` | AWS region | `us-west-2` |
| `AWS access key id` | Access key for DynamoDB | `mockKey` |
| `AWS secret access key` | Secret key for DynamoDB (masked input) | `mockSecret` |
| `PostgreSQL connection string` | Full Postgres connection URI | `postgresql://trayt_user:trayt_password@localhost:5432/trayt_db` |
| `PostgreSQL schema` | Destination schema name | `public` |
| `DynamoDB scan page size` | Items per scan page during initial migration | `100` |
| `Stream poll interval (ms)` | Delay between empty stream polls during CDC | `1000` |
| `Enable continuous CDC replication?` | Whether to keep syncing after the initial migration | `false` |

> 💡 You can pre-fill these defaults using environment variables instead of typing them every time — see [Environment Variables](#environment-variables) below.

### 3. Connection check

Immediately after the prompts, the tool verifies both connections:

```
🔎 Checking connections...
✅ DynamoDB connection OK
✅ PostgreSQL connection OK
```

If either fails, the tool prints the error and exits — no partial work is done.

### 4. Table discovery & selection

```
📋 Listing DynamoDB tables...
Found 4 table(s): Users, Orders, Sessions, Logs

? Which tables should be migrated?
❯ All tables (4)
  Select specific tables
```

If you choose **Select specific tables**, you'll get a multiselect list (use **Space** to toggle, **Enter** to confirm):

```
? Select tables to migrate
◉ Users
◯ Orders
◉ Sessions
◯ Logs
```

### 5. Migration runs per table

For each selected table, the tool will:

1. Scan all items from DynamoDB (paginated)
2. Create the corresponding PostgreSQL table if it doesn't exist, inferring column types
3. Add any new columns found in the data if the table already exists
4. Upsert every item into PostgreSQL (insert new rows, update existing ones by primary key)

```
📥 [Users] Scanning...
📦 [Users] Retrieved 532 item(s)
🛠  [Users] Created PostgreSQL table public.users
🚚 [Users] Migrating 532 item(s)...
   [Users] 100/532
   [Users] 200/532
   ...
```

### 6. Final report

Regardless of any individual failures, you get a full summary:

```
==============================================
 MIGRATION REPORT
==============================================
✅ Users: 532 item(s) migrated in 4213ms
❌ Orders: FAILED - DynamoDB table "Orders" was not found
✅ Sessions: 128 item(s) migrated in 902ms | columns added: last_login
----------------------------------------------
Total: 3 | Success: 2 | Failed: 1
==============================================
```

A failure on one table **never** stops the others from running.

### 7. (Optional) Continuous CDC replication

If you answered **Yes** to "Enable continuous CDC replication?", the tool will start tailing each successfully migrated table's DynamoDB Stream and apply `INSERT` / `MODIFY` / `REMOVE` events to PostgreSQL in real time:

```
📡 Starting continuous CDC replication (Ctrl+C to stop)...

   📡 [Users] Stream: arn:aws:dynamodb:us-west-2:...:table/Users/stream/...
   🔄 [Users] MODIFY replicated
   🗑 [Sessions] REMOVE replicated
```

Stop it anytime with **Ctrl+C** — the tool shuts down cleanly.

> ⚠️ If DynamoDB Streams are not enabled on a table, that table is simply skipped for CDC (with a warning) while others continue.

---

## Environment Variables

You can pre-fill any prompt's default value by setting these before running the command. You'll still see the prompt, but pressing **Enter** will accept the environment-provided value instead of the built-in default.

```bash
export DYNAMO_ENDPOINT="https://dynamodb.us-west-2.amazonaws.com"
export AWS_REGION="us-west-2"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export PG_CONNECTION_STRING="postgresql://user:password@host:5432/dbname"
export PG_SCHEMA="public"
export SCAN_PAGE_SIZE=200
export POLL_INTERVAL_MS=2000

npx dynamodb-to-pg-sync
```

---

## Type Mapping

| DynamoDB Type | PostgreSQL Type |
|---|---|
| `S` (String) | `TEXT` |
| `N` (Number) | `NUMERIC` |
| `BOOL` (Boolean) | `BOOLEAN` |
| `NULL` | `BOOLEAN` |
| `M` (Map) | `JSONB` |
| `L` (List) | `JSONB` |
| `SS` (String Set) | `JSONB` |
| `NS` (Number Set) | `JSONB` |
| `BS` (Binary Set) | `JSONB` |
| `B` (Binary) | `JSONB` |

All column and table names are normalized: lower-cased, trimmed, non-alphanumeric characters replaced with `_`, and a leading digit prefixed with `_` (e.g. `UserID` → `userid`, `2FA-Enabled` → `_2fa_enabled`).

---

## Running Against DynamoDB Local

If you're testing locally with [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html):

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

Then when prompted:
- **DynamoDB endpoint**: `http://localhost:8000`
- **AWS access key id / secret**: any placeholder value works (e.g. `mockKey` / `mockSecret`)

---

## Troubleshooting

**"Could not connect to DynamoDB"**
- Check the endpoint URL and that the service is reachable from your machine.
- Verify your AWS credentials and region match the target table's region.

**"Could not connect to PostgreSQL"**
- Verify the connection string, that the database exists, and that the user has privileges to create schemas/tables.

**"Unable to infer schema because DynamoDB contains no records..."**
- The table has zero items and no usable data to infer columns from beyond its key schema. Add at least one item, or create the destination table manually first.

**A table fails but I don't know why**
- Check the `MIGRATION REPORT` at the end of the run — each failed table lists its specific error message.

**DynamoDB Streams warning during CDC**
- Streams must be enabled on the DynamoDB table (`NEW_AND_OLD_IMAGES` or similar) for CDC to work. Tables without streams are skipped with a warning, not a hard failure.

---

## License
MIT