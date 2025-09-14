import {type BetterSQLite3Database} from 'drizzle-orm/better-sqlite3';
import type * as schema from './schema.js';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

export type Database = BetterSQLite3Database<typeof schema>;
export type sqliteDatabase = BaseSQLiteDatabase;
