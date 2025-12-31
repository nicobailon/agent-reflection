import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { homedir } from "os";

const dbPath = process.env.DB_PATH || `${homedir()}/data/agent-reflection/reflection.db`;
export const db = new Database(dbPath);
sqliteVec.load(db);
