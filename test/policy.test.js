const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { getDefaultPolicy, loadPolicy } = require("../out/policy");

function withWorkspace(callback) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vibesec-policy-"));
  try {
    return callback(workspaceRoot);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

function writePolicy(workspaceRoot, content) {
  fs.writeFileSync(path.join(workspaceRoot, ".vibesec.yaml"), content, "utf8");
}

test("loadPolicy returns a usable default policy when .vibesec.yaml is missing", () => {
  withWorkspace((workspaceRoot) => {
    const result = loadPolicy(workspaceRoot, process.cwd());

    assert.equal(result.ok, false);
    assert.equal(result.policy.isDefault, true);
    assert.deepEqual(result.policy.presets, getDefaultPolicy().presets);
    assert.match(result.errors?.[0] ?? "", /No \.vibesec\.yaml found/);
  });
});

test("loadPolicy treats an empty selector as an intentional zero-policy scan", () => {
  withWorkspace((workspaceRoot) => {
    writePolicy(workspaceRoot, "activePolicyFiles: []\n");

    const result = loadPolicy(workspaceRoot, process.cwd());

    assert.equal(result.ok, true);
    assert.equal(result.policy.isDefault, false);
    assert.deepEqual(result.policy.presets, []);
    assert.deepEqual(result.policy.rules, []);
  });
});

test("loadPolicy reports YAML syntax errors but still returns default settings", () => {
  withWorkspace((workspaceRoot) => {
    writePolicy(workspaceRoot, "presets:\n  - vibesec:default\n  - : broken\n");

    const result = loadPolicy(workspaceRoot, process.cwd());

    assert.equal(result.ok, false);
    assert.equal(result.policy.isDefault, true);
    assert.match(result.errors?.[0] ?? "", /Invalid YAML syntax/);
  });
});

test("loadPolicy validates inline custom rules and keeps valid rule data", () => {
  withWorkspace((workspaceRoot) => {
    writePolicy(workspaceRoot, [
      "presets: []",
      "rules:",
      "  - id: local.no-eval",
      "    message: Avoid eval.",
      "    severity: error",
      "    languages: [javascript]",
      "    pattern: eval(...)",
      "",
    ].join("\n"));

    const result = loadPolicy(workspaceRoot, process.cwd());

    assert.equal(result.ok, true);
    assert.equal(result.policy.rules.length, 1);
    assert.equal(result.policy.rules[0].id, "local.no-eval");
    assert.equal(result.policy.rules[0].severity, "ERROR");
  });
});
