#!/bin/node

import { readFileSync } from 'node:fs';
import Database from '../node_modules/better-sqlite3/lib/database.js';
import { getFileSize, pullSshFileAsync } from './common/utils.mjs';

const MIGRATION_SQL_FILE = process.argv[2];
const TEMP_DB_LOCATION = '/tmp/xikibot.sqlite';

if (!MIGRATION_SQL_FILE || MIGRATION_SQL_FILE.trim().length == 0) {
    console.error('Please, specify the path of the migration script in the first argument.');
    process.exit(1);
}

const MIGRATION_SQL = readFileSync(MIGRATION_SQL_FILE, 'utf-8');

await pullSshFileAsync('/app/data/xikibot.sqlite', '/tmp/xikibot.sqlite');

console.log("Opening DB…");
const db = new Database(TEMP_DB_LOCATION, {
    readonly: false,
    fileMustExist: true,
});

console.log("Pre-migration integrity check…");
console.log(db.pragma('integrity_check'));

console.log("Migrating…");
db.exec(MIGRATION_SQL);

console.log(`Compacting (size before ${getFileSize(TEMP_DB_LOCATION)})…`);
db.exec('VACUUM');
console.log(`Compacted (size after ${getFileSize(TEMP_DB_LOCATION)}).`);

console.log("Post-migration integrity check…");
console.log(db.pragma('integrity_check'));

db.close();

console.log(`Migration successful. Find result in: ${TEMP_DB_LOCATION}`);
