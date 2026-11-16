import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { stagedAcpMcpServers } from "../src/acp/mcp-servers.js";

test("ACP forwards enabled isolated stdio/http servers, excluding bridge identities and malformed entries", () => {
 const home = fs.mkdtempSync(path.join(os.tmpdir(), "agy-acp-mcp-"));
 try {
  fs.mkdirSync(path.join(home, "config"));
  fs.writeFileSync(path.join(home, "config", "mcp_config.json"), JSON.stringify({ mcpServers: {
   codegraph: { command: "node", args: ["server.js"], env: { GRAPH_MODE: "local" } },
   bare: { command: "server" },
   web: { serverUrl: "https://example.test/mcp", headers: { Authorization: "fixture" } },
   disabled: { command: "disabled", disabled: true },
   "pi-bridge-123": { command: "foreign" }, "pi-agy-deadbeef": { command: "foreign" },
   bad: null, badArgs: { command: "node", args: [1] }, badEnv: { command: "node", env: { X: 1 } },
   badHttp: { serverUrl: "not-a-url" }, badHeaders: { serverUrl: "https://example.test", headers: [] },
   nullArgs: { command: "node", args: null }, nullEnv: { command: "node", env: null },
   nullHeaders: { serverUrl: "https://example.test", headers: null },
  } }));
  const logs: string[] = [];
  assert.deepEqual(stagedAcpMcpServers(home, (message) => logs.push(message)), [
   { name: "codegraph", command: "node", args: ["server.js"], env: [{ name: "GRAPH_MODE", value: "local" }] },
   { name: "bare", command: "server", args: [], env: [] },
   { name: "web", type: "http", url: "https://example.test/mcp", headers: [{ name: "Authorization", value: "fixture" }] },
  ]);
  assert.equal(logs.length, 8);
  assert.equal(logs.join(" ").includes("fixture"), false);
  assert.deepEqual(stagedAcpMcpServers(undefined), []);
 } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
