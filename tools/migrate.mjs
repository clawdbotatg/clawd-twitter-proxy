#!/usr/bin/env node
// Apply tools/schema.sql as the btt role. Usage: DATABASE_URL=… node tools/migrate.mjs
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("set DATABASE_URL (the btt role's URL)"); process.exit(1); }
const sql = neon(url);
const ddl = readFileSync(new URL("./schema.sql", import.meta.url), "utf8")
  .split(/;\s*$/m).map(s => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
for (const stmt of ddl) await sql.query(stmt);
const tables = await sql`select table_name from information_schema.tables where table_schema = 'btt' order by 1`;
console.log("btt tables:", tables.map(t => t.table_name).join(", "));
