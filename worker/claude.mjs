// The isolated brain: `claude -p` on the subscription, with nothing to reach.
//
// Every prompt that lands here was written by an anonymous stranger who paid
// CV, so the child gets:
//   - no tools at all (--tools ""), no MCP, no settings files, no plugins
//   - no CLAUDE.md, no auto-memory: its only memory is agent/*.md
//   - a MINIMAL env built from scratch. The worker's own env (Twitter keys,
//     OpenAI key, worker secret) is never inherited, so there is nothing to
//     leak even if a prompt talks it into trying.
//   - an empty scratch dir as cwd, no session persistence
import { spawn } from "child_process";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const AGENT_DIR = join(HERE, "..", "agent");
const SANDBOX = join(HERE, "state", "sandbox");
mkdirSync(SANDBOX, { recursive: true });

export const MODEL = process.env.AGENT_MODEL || "claude-opus-5-5";
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const TIMEOUT_MS = 4 * 60 * 1000;

export function childEnv() {
  const env = {
    PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
    HOME: process.env.HOME,
    // Not secrets, but the keychain lookup for the subscription login needs them.
    USER: process.env.USER,
    LOGNAME: process.env.LOGNAME,
    TMPDIR: process.env.TMPDIR,
    LANG: "en_US.UTF-8",
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    CLAUDE_CODE_DISABLE_ORG_MEMORY: "1",
    CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS: "1",
    CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_AUTOUPDATER: "1",
  };
  // Which subscription login to bill (a ~/.clawd-accounts/<name> dir).
  if (process.env.AGENT_CLAUDE_CONFIG_DIR) env.CLAUDE_CONFIG_DIR = process.env.AGENT_CLAUDE_CONFIG_DIR;
  return env;
}

export function claudeArgs(systemPromptFile) {
  return [
    "-p",
    "--model", MODEL,
    "--tools", "",
    "--strict-mcp-config",
    "--setting-sources", "",
    "--no-session-persistence",
    "--exclude-dynamic-system-prompt-sections",
    "--system-prompt-file", systemPromptFile,
    "--output-format", "json",
  ];
}

/** Run one prompt against a system-prompt file; resolves to the text result. */
export function runClaude(systemPromptFile, prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, claudeArgs(systemPromptFile), {
      cwd: SANDBOX,
      env: childEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("claude timed out")); }, TIMEOUT_MS);
    child.stdout.on("data", d => (out += d));
    child.stderr.on("data", d => (err += d));
    child.on("error", e => { clearTimeout(timer); reject(e); });
    child.on("close", code => {
      clearTimeout(timer);
      let d;
      try { d = JSON.parse(out); } catch {
        return reject(new Error(`claude exited ${code}: ${(err || out).slice(0, 300)}`));
      }
      if (d.is_error || typeof d.result !== "string") {
        return reject(new Error(`claude error: ${String(d.result || d.subtype || err).slice(0, 300)}`));
      }
      resolve(d.result);
    });
    child.stdin.end(prompt);
  });
}
