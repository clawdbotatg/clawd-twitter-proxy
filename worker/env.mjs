// Load env files without copying secrets around: the Twitter + OpenAI keys
// stay in clawd-twitter's .env (their one home on this machine); only this
// service's own values (WORKER_SECRET, API_BASE) live in worker/.env.
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const HERE = dirname(fileURLToPath(import.meta.url));

function load(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

load(join(HERE, ".env"));
load(process.env.TWITTER_ENV_FILE || join(homedir(), "clawd-harness/projects/clawd-twitter/.env"));
