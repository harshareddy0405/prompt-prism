const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { boot } = require("./harness.cjs");
const key = fs
  .readFileSync(path.join(__dirname, "../app.js"), "utf8")
  .match(/const (?:STORAGE_KEY|STORE|KEY) = "([^"]+)"/)[1];
const fixture = async (t, options) => {
  const h = await boot(options);
  t.after(() => {
    const errors = [...h.errors];
    h.close();
    assert.deepEqual(errors, []);
  });
  return h;
};
const submit = (h, selector) =>
  h
    .$(selector)
    .dispatchEvent(
      new h.window.Event("submit", { bubbles: true, cancelable: true }),
    );
const readBlob = (h, blob) =>
  new Promise((resolve, reject) => {
    const r = new h.window.FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsText(blob);
  });
async function roundTrip(t, h) {
  await h.wait(450);
  const raw = h.window.localStorage.getItem(key);
  assert.ok(raw, "Interaction should persist workspace data");
  assert.equal(
    h.window.validateWorkspace(JSON.parse(raw)),
    true,
    "Generated state must satisfy its schema",
  );
  const reloaded = await fixture(t, { saved: { [key]: raw } });
  assert.equal(
    reloaded.$("#storage-notice"),
    null,
    "Valid edits must not be discarded on reload",
  );
}
test("prompt variables compile as text and versions persist", async (t) => {
  const h = await fixture(t);
  h.input("#promptEditor", "<img src=x onerror=alert(1)> Hello {{audience}}");
  assert.equal(h.$("#compiledPreview img"), null);
  assert.match(h.$("#compiledPreview").textContent, /small design agency/);
  h.click("#snapshotButton");
  await roundTrip(t, h);
});
test("variant comparison updates without overwriting the baseline", async (t) => {
  const h = await fixture(t);
  h.input("#promptEditor", "Baseline instruction");
  h.click("#variantBTab");
  h.input("#promptEditor", "Challenger instruction");
  h.click("#compareButton");
  assert.match(h.$("#compareA").textContent, /Baseline instruction/);
  assert.match(h.$("#compareB").textContent, /Challenger instruction/);
  h.click("#exportButton");
  assert.equal(h.downloads.length, 1);
});
