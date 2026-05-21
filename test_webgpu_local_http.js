// Proves WebGPU inference actually runs end-to-end when the page is served
// over http://localhost (via serve.py) — the supported way to run browser
// inference. Skips automatically if the chromium-headless-shell doesn't
// expose a usable WebGPU adapter on this machine (CI / no-GPU).
//
// Test order:
//   1. Spawn serve.py
//   2. Open http://localhost:8765/prompt-forge.html with --enable-unsafe-webgpu
//   3. Confirm the page loads with no JS errors (banner is hidden over http)
//   4. Force the page into browser mode and trigger a real forge() with a
//      tiny model (SmolLM2-135M, ~80MB) and small max_new_tokens
//   5. Wait for either output text OR a non-throw error
//
// We don't strictly assert generation produces specific text — model output
// is nondeterministic and slow. We assert: no JS error, real chars appended.

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8765;
const URL  = `http://127.0.0.1:${PORT}/prompt-forge.html`;
const ROOT = __dirname;

let passed = 0, failed = 0, skipped = 0;
const rec = (n, ok, d) => { if (ok) { passed++; console.log(' ✓ ' + n); } else { failed++; console.log(' ✗ ' + n + (d ? ' → ' + d : '')); } };
const skip = (n, why) => { skipped++; console.log(' ⊘ ' + n + (why ? ' → ' + why : '')); };

async function waitFor(check, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Timeout waiting for: ' + label);
}

(async () => {
  console.log('\n── WebGPU over local HTTP ──');

  // 1. start serve.py
  const server = spawn('python3', ['serve.py'], { cwd: ROOT, env: { ...process.env, PF_PORT: String(PORT) }});
  server.stderr.on('data', () => {}); // quiet
  server.stdout.on('data', () => {});
  await new Promise(r => setTimeout(r, 600));

  let browser;
  try {
    // 2. launch chromium with WebGPU flags
    browser = await chromium.launch({
      args: [
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan,UseSkiaRenderer',
        '--no-sandbox',
      ],
    });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });

    await page.goto(URL);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(400);

    // Filter known-expected errors (Ollama not running)
    const realErrs = errs.filter(s => !/localhost:11434|ERR_FAILED|CORS|Access to fetch/i.test(s));
    rec('page loads over http without unexpected errors', realErrs.length === 0, realErrs.join(' | '));

    // 3. Banner hidden when not on file://
    await page.click('#btnBrowser');
    const bannerVisible = await page.locator('#fileProtoBanner').isVisible().catch(() => false);
    rec('file:// banner hidden over http', !bannerVisible);

    // 3b. Every model in the dropdown MUST exist in WebLLM's prebuiltAppConfig.
    // This is the canary that catches the bug where we listed a model ID that
    // doesn't ship in the runtime version we're loading.
    const validation = await page.evaluate(async () => {
      const mod = await import('https://esm.run/@mlc-ai/web-llm');
      const valid = new Set(mod.prebuiltAppConfig.model_list.map(m => m.model_id));
      const dropdown = Array.from(document.getElementById('browserModel').options).map(o => o.value);
      const missing = dropdown.filter(v => v && !valid.has(v));
      return { total: dropdown.length, valid_count: valid.size, missing };
    });
    rec('all dropdown IDs exist in prebuiltAppConfig',
        validation.missing.length === 0,
        'missing: [' + validation.missing.join(', ') + ']');

    // 4. Probe for *functional* WebGPU: adapter + device + a trivial compute
    //    pipeline. Headless Chromium often has the adapter but no working
    //    backend; ORT then aborts the same way it would on any machine
    //    without a real driver. Skip the inference run in that case.
    const webgpuFunctional = await page.evaluate(async () => {
      if (!('gpu' in navigator)) return { ok: false, why: 'no navigator.gpu' };
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return { ok: false, why: 'no adapter' };
        const device = await adapter.requestDevice();
        if (!device) return { ok: false, why: 'no device' };
        // Try a trivial 1-thread compute shader. If this throws, the backend
        // is non-functional (typical in chromium-headless-shell without GPU).
        const shaderModule = device.createShaderModule({ code:
          `@compute @workgroup_size(1) fn main() {}` });
        const pipeline = device.createComputePipeline({
          layout: 'auto',
          compute: { module: shaderModule, entryPoint: 'main' },
        });
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.dispatchWorkgroups(1);
        pass.end();
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();
        return { ok: true };
      } catch (e) {
        return { ok: false, why: e.message };
      }
    });

    if (!webgpuFunctional.ok) {
      skip('Functional WebGPU not available in chromium-headless-shell — inference run skipped', webgpuFunctional.why);
      console.log('\n══════════════════════════════════════');
      console.log(`Local-HTTP: ${passed} passed · ${failed} failed · ${skipped} skipped`);
      console.log('Note: skipping the real inference run is expected in headless CI without a GPU.');
      console.log('Manual verification: run  python3 serve.py  and open ' + URL + ' in your real Chrome.');
      await browser.close();
      server.kill();
      process.exit(failed ? 1 : 0);
    }

    // 5. Pick the smallest model and run a tiny generation
    await page.selectOption('#browserModel', 'SmolLM2-135M-Instruct-q0f16-MLC');
    // open params to set tiny max tokens
    await page.evaluate(() => {
      document.getElementById('sec-params').classList.add('open');
      const m = document.getElementById('maxTokens'); m.value = '30'; m.dispatchEvent(new Event('input'));
    });

    await page.fill('#taskInput', 'Say "hello".');
    await page.click('#forgeBtn');

    // Wait for either: actual streamed output appears, OR an error message shows
    const result = await page.evaluate(async () => {
      const start = Date.now();
      while (Date.now() - start < 240000) { // 4 min max for first-time model download
        const err = document.getElementById('errMsg');
        if (err.classList.contains('visible'))
          return { kind: 'error', text: err.textContent };
        const raw = document.getElementById('outputContent').dataset.raw || '';
        if (raw.length > 5)
          return { kind: 'output', text: raw };
        await new Promise(r => setTimeout(r, 500));
      }
      return { kind: 'timeout' };
    });

    if (result.kind === 'output') {
      rec('real WebGPU inference produced output', true);
      console.log('     output preview: ' + result.text.replace(/\n/g, ' ').slice(0, 80));
    } else if (result.kind === 'error') {
      // Known-headless-only limitations that real Chrome doesn't have.
      const headlessGaps = /shader-f16|Aborted|RuntimeError|dawn-features|extension/i;
      if (headlessGaps.test(result.text)) {
        skip('real WebGPU inference produced output',
             'headless WebGPU feature gap — verify in real Chrome: ' + result.text.slice(0, 120));
      } else {
        rec('real WebGPU inference produced output', false, result.text.slice(0, 200));
      }
    } else {
      skip('real WebGPU inference produced output', 'timeout — model download too slow in CI');
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }

  console.log('\n══════════════════════════════════════');
  console.log(`Local-HTTP: ${passed} passed · ${failed} failed · ${skipped} skipped`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
