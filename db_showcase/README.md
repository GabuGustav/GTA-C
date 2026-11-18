# db_showcase - Liberty Network Database Module Showcase

This resource demonstrates the functionality of the Liberty Network Database Module. It showcases the hybrid SQLite (.db) + JSON fallback system with 24-hour backup capabilities.

## Overview

The db_module provides a database system that:
- Uses SQLite `.db` files as the primary storage engine
- Falls back to JSON `.json` files if SQLite is unavailable
- Automatically creates 24-hour backups on write operations
- Provides a consistent Squirrel API (`db.lua`) for database operations
- Exposes console commands for database administration

## Structure

```
resources/db_showcase/
├── meta.xml          ← Module manifest
├── data/
│   ├── db/           ← SQLite .db files and JSON fallbacks
│   │   ├── accounts.db     ← Primary accounts database
│   │   ├── accounts.json   ← JSON fallback
│   │   └── backups/        ← 24-hour backup rotation
│   │       └── backup_20240115_143000.json
│   └── characters/       ← Character data (example)
├── commands.txt      ← Custom console commands (optional)
└── this README.md

## Database Files

### Primary Storage (.db files)
- Stored in: `resources/Liberty Network/data/db/`
- Format: SQLite databases
- Contents: All table data with full schema

### JSON Fallback (.json files)
- Stored in: `resources/Liberty Network/data/db/`
- Format: JSON encoded tables
- Used when: SQLite unavailable or as fallback
- Auto-migrated from existing JSON data on module init

### 24-Hour Backups
- Stored in: `resources/Liberty Network/data/db/backups/`
- Naming: `backup_YYYYMMDD_HHMMSS.json`
- Created: On each write operation (save, create, update, delete)
- Retention: Keep backups from last 24 hours
- Purge: Automatic removal of older backups
- Purpose: Admins can check on data integrity if DB gets corrupted

## Console Commands

The following `/db` commands are available in the server console:

### Table Management
- `/db create table_name columns...` - Create a new table
- `/db list` - List all tables
- `/db drop table_name` - Drop/delete a table

### Data Operations
- `/db insert table_name key value [key value ...]` - Insert a record
- `/db select table_name [where condition] [fields]` - Query records
- `/db update table_name set field1 value1 [where condition]` - Update records
- `/db delete table_name [where condition]` - Delete records

### Schema & Backup
- `/db schema table_name` - Show table schema
- `/db optimize table_name` - Optimize table
- `/db backup` - Create manual backup
- `/db backups` - List all available backups
- `/db migrate` - Migrate existing JSON data to SQLite

### Examples

Create users table:
```
/db create users id integer username text displayName text createdAt integer
```

Insert a user:
```
/db insert users id 1 username John displayName "John Doe" createdAt 1700000000
```

Select users:
```
/db select users
```

Select users where username=John:
```
/db select users "username == John"
```

Update user display name:
```
/db update users set displayName "Johnny" where "username == John"
```

Delete user:
```
/db delete users where "username == John"
```

Show schema:
```
/db schema users
```

List backups:
```
/db backups
```

Create backup:
```
/db backup
```

Migrate existing data:
```
/db migrate
```

## 24-Hour Backup System

The backup system automatically:
1. Creates a backup on every write operation (db.save, db.insert, db.update, db.delete)
2. Names backups: `backup_YYYYMMDD_HHMMSS.json`
3. Keeps backups from the last 24 hours
4. Purges backups older than 24 hours
5. Can be manually triggered with `/db backup`
6. Can be listed with `/db backups`
7. Can be restored with `/db restore backup_name`

The backup includes all collection data and is essential for:
- Recovering from accidental data corruption
- Auditing changes over time
- Rolling back to a known good state
- Checking ATOM properties (user names, display names, hashed passwords)

## Migration from Existing JSON Data

On first module initialization, the module automatically:
1. Checks for existing JSON files: `accounts.json`, `characters.json`, `sessions.json`
2. Migrates data to SQLite format
3. Preserves all existing data structures
4. Switches to SQLite mode for future operations

Existing data in `resources/Liberty Network/data/` will be automatically migrated.

## Integration with Liberty Network

This resource is designed to work with the Liberty Network framework:
- Registers as `LN.db` global API
- Can be required by other resources
- Exposes consistent API regardless of storage backend
- Works with or without SQLite installed

## Administration

### Checking Database Status
```
/db getMode  -- Shows: sqlite, mysql, or json
/db list     -- Lists all tables
/db backups  -- Lists available backups
```

### Verifying Data Integrity
```
/db select accounts  -- View all accounts
/db select characters -- View all characters
```

### Emergency Recovery
If the database becomes corrupted:
1. Use `/db backups` to list available backups
2. Use `/db restore backup_name` to restore from a backup
3. The 24-hour backup ensures you can recover recent data

## Configuration

Modify the database path in `db.init()`:
```lua
db.init({
    db_path = "resources/Liberty Network/data/db/",
    json_path = "resources/Liberty Network/data/db/",
    backup_dir = "resources/Liberty Network/data/db/backups/"
})
```

Or set via console:
```
/db init {db_path = "resources/Liberty Network/data/db/"}
```

## License

This module is part of the Liberty Network ecosystem. 
See the main module (db_module) for full license information.