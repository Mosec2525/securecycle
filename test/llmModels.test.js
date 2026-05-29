const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PROVIDER_DEFAULT_MODEL,
  providerFromKeyHint,
  resolveProviderModel,
  validateProviderSelection,
} = require("../out/llmModels");

test("providerFromKeyHint detects Groq API keys without changing other providers", () => {
  assert.equal(providerFromKeyHint("anthropic", "  gsk_live_abc123  "), "groq");
  assert.equal(providerFromKeyHint("openai", "sk-openai-key"), "openai");
});

test("resolveProviderModel falls back when a model id belongs to another provider", () => {
  assert.equal(
    resolveProviderModel("anthropic", "gpt-5-nano"),
    PROVIDER_DEFAULT_MODEL.anthropic,
  );
  assert.equal(
    resolveProviderModel("openai", "claude-haiku-4-5"),
    PROVIDER_DEFAULT_MODEL.openai,
  );
  assert.equal(resolveProviderModel("groq", "openai/gpt-oss-20b"), "openai/gpt-oss-20b");
});

test("resolveProviderModel allows exact custom model ids for custom providers", () => {
  assert.equal(resolveProviderModel("custom", "my-router/model-a"), "my-router/model-a");
  assert.equal(resolveProviderModel("custom", "custom-model"), PROVIDER_DEFAULT_MODEL.custom);
});

test("validateProviderSelection requires a model id", () => {
  assert.match(
    validateProviderSelection("openai", "") ?? "",
    /needs a model id/i,
  );
});

test("validateProviderSelection validates custom provider endpoints", () => {
  assert.match(
    validateProviderSelection("custom", "router-model") ?? "",
    /endpoint/i,
  );
  assert.match(
    validateProviderSelection("custom", "router-model", "ftp://example.test/v1/chat/completions") ?? "",
    /http:\/\/ or https:\/\//i,
  );
  assert.equal(
    validateProviderSelection("custom", "router-model", "https://example.test/v1/chat/completions"),
    null,
  );
});
