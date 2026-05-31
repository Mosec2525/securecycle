const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const test = require("node:test");

test("CLI help exposes Docker scan usage", () => {
  const help = execFileSync(process.execPath, ["out/cli.js", "--help"], { encoding: "utf8" });

  assert.match(help, /vibesec scan \[target\]/);
  assert.match(help, /docker run --rm -v/);
  assert.match(help, /--no-fail-on-findings/);
});

test("Docker packaging files are present", () => {
  assert.ok(fs.existsSync("Dockerfile"));
  assert.ok(fs.existsSync(".dockerignore"));
  assert.ok(fs.existsSync(".github/workflows/docker.yml"));
  assert.ok(fs.existsSync("docs/docker.md"));
});
