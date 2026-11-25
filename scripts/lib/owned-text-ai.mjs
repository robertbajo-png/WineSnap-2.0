import assert from "node:assert/strict";

const models = ["gpt-6-luna", "gpt-6.2-sol"];

function profile(provider, model) {
  if (provider === "openai") assert.ok(models.includes(model), "Unsupported owned text model");
  else {
    assert.equal(provider, "gemini", "Unsupported owned text provider");
    assert.equal(model, undefined, "Gemini does not take an OpenAI model");
  }
  return { provider, model };
}

export function selectOwnedTextAi({ action, requested, model, installed, installedModel }) {
  const previous = profile(installed ?? "gemini", installedModel);
  if (requested === undefined) {
    assert.notEqual(action, "TextAiUpdate", "An explicit text provider is required");
    assert.equal(model, undefined, "A model requires an explicit OpenAI provider");
    return previous;
  }
  assert.equal(action, "TextAiUpdate", "Changing text AI requires its own guarded update");
  return profile(requested, requested === "openai" ? (model ?? models[0]) : model);
}

export function textAiRollbackTag(image) {
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  return "winesnap-owned:text-ai-rollback-" + image.slice(7, 19);
}
