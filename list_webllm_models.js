// Enumerate every model in WebLLM's prebuilt config so we list only IDs
// that actually exist in the version we're loading. Run once after upgrading
// the WebLLM URL to regenerate the model dropdown.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const ROOT = __dirname;
const PORT = 8765;
const URL  = `http://127.0.0.1:${PORT}/prompt-forge.html`;

(async () => {
  const server = spawn('python3', ['serve.py'], { cwd: ROOT, env: { ...process.env, PF_PORT: String(PORT) }});
  server.stderr.on('data', () => {});
  server.stdout.on('data', () => {});
  await new Promise(r => setTimeout(r, 600));

  const browser = await chromium.launch();
  const page = await browser.newContext().then(c => c.newPage());
  await page.goto(URL);
  await page.waitForLoadState('domcontentloaded');

  const models = await page.evaluate(async () => {
    const mod = await import('https://esm.run/@mlc-ai/web-llm');
    const cfg = mod.prebuiltAppConfig;
    return cfg.model_list.map(m => ({
      id: m.model_id,
      vram_mb: m.vram_required_MB,
      lib: m.model_lib?.replace(/^.*\//, '').replace(/-ctx.*$/, ''),
    }));
  });

  console.log(JSON.stringify(models, null, 2));
  console.log('\nTotal:', models.length);

  await browser.close();
  server.kill();
})();
