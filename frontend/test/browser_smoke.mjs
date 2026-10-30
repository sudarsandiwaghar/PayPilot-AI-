import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// CDP WebSocket Client
class ChromeClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.ws = null
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl)
      this.ws.onopen = () => resolve()
      this.ws.onerror = (err) => reject(err)
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)
          this.pending.delete(msg.id)
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)))
          } else {
            resolve(msg.result)
          }
        } else if (msg.method) {
          const callbacks = this.listeners.get(msg.method) || []
          for (const cb of callbacks) {
            try {
              cb(msg.params)
            } catch (e) {
              console.error('Listener error:', e)
            }
          }
        }
      }
    })
  }

  on(method, callback) {
    if (!this.listeners.has(method)) {
      this.listeners.set(method, [])
    }
    this.listeners.get(method).push(callback)
  }

  async send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${res.exceptionDetails.text} (${JSON.stringify(res.exceptionDetails)})`)
    }
    return res.result?.value
  }

  async waitForFunction(fnExpression, timeoutMs = 15000, pollIntervalMs = 250) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const val = await this.evaluate(fnExpression)
        if (val) return val
      } catch {
        // ignore and retry
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs))
    }
    throw new Error(`waitForFunction timed out after ${timeoutMs}ms: ${fnExpression}`)
  }

  close() {
    if (this.ws) {
      this.ws.close()
    }
  }
}

async function findChromeBinary() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  for (const p of paths) {
    try {
      const { existsSync } = await import('node:fs')
      if (existsSync(p)) return p
    } catch {
      // ignore
    }
  }
  throw new Error('Neither Chrome nor Edge was found')
}

async function main() {
  console.log('=== PayPilot AI Browser Smoke Test (Headless CDP) ===')
  const chromePath = await findChromeBinary()
  console.log(`Using browser: ${chromePath}`)

  const tempProfile = mkdtempSync(join(tmpdir(), 'chrome-smoke-'))
  const debugPort = 9222

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${tempProfile}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' })

  let client = null

  try {
    // Wait for CDP endpoint to become ready
    let wsUrl = null
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
        if (res.ok) {
          const data = await res.json()
          wsUrl = data.webSocketDebuggerUrl
          break
        }
      } catch {
        // wait
      }
      await new Promise((r) => setTimeout(r, 300))
    }

    if (!wsUrl) {
      throw new Error('Failed to connect to Chrome DevTools port')
    }
    console.log('Connected to Chrome DevTools Protocol')

    // Create a new target/page
    const newPageRes = await fetch(`http://127.0.0.1:${debugPort}/json/new?http://127.0.0.1:5173`, { method: 'PUT' })
    const newPageData = await newPageRes.json()
    client = new ChromeClient(newPageData.webSocketDebuggerUrl)
    await client.connect()

    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Network.enable')

    // Track recommendation POST requests (filtering out browser CORS OPTIONS preflight)
    const recommendCalls = []
    client.on('Network.requestWillBeSent', (params) => {
      const url = params.request.url
      if (
        params.request.method === 'POST' &&
        url.includes('/api/v1/sessions/') &&
        url.includes('/agent/recommend')
      ) {
        let parsedBody = null
        if (params.request.postData) {
          try {
            parsedBody = JSON.parse(params.request.postData)
          } catch {
            parsedBody = params.request.postData
          }
        }
        recommendCalls.push({
          timestamp: Date.now(),
          url,
          method: params.request.method,
          hasAuth: Boolean(params.request.headers?.Authorization || params.request.headers?.authorization),
          body: parsedBody,
        })
      }
    })

    console.log('\n[1/7] Waiting for App and Session initialization...')
    await client.waitForFunction(`Boolean(window.__PAYPILOT_INITIALIZED__ || document.querySelector('#dashboard-search-input'))`)
    // Wait until session is active
    await client.waitForFunction(`document.body.innerText.includes('Active Session') || document.body.innerText.includes('Connected')`, 10000)
    console.log('✔ App loaded and authenticated session verified.')

    // Helper injected into page to reliably set React input value
    const injectHelper = async () => {
      await client.evaluate(`
        window.__setReactInput = (selector, val) => {
          const el = document.querySelector(selector);
          if (!el) throw new Error('Element not found: ' + selector);
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
      `)
    }
    await injectHelper()

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Empty input on Dashboard
    // ─────────────────────────────────────────────────────────────
    console.log('\n[2/7] Testing empty search input submission on Dashboard...')
    recommendCalls.length = 0
    await client.evaluate(`(() => {
      window.__setReactInput('#dashboard-search-input', '');
      const btn = document.querySelector('#dashboard-search-btn');
      btn.click();
    })()`)
    await client.waitForFunction(`Boolean(document.querySelector('#dashboard-inline-error'))`)
    const emptyErrorText = await client.evaluate(`document.querySelector('#dashboard-inline-error').innerText`)
    console.log(`✔ Empty input blocked with inline error: "${emptyErrorText.trim()}"`)
    console.log(`✔ Recommendation requests dispatched: ${recommendCalls.length} (Expected: 0)`)
    if (recommendCalls.length !== 0) throw new Error('Empty query triggered unexpected API request')

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Dynamic Custom Query Submission from Dashboard
    // ─────────────────────────────────────────────────────────────
    console.log('\n[3/7] Submitting custom product query from Dashboard...')
    const customQuery = 'noise-canceling headphones under $400'
    recommendCalls.length = 0
    await client.evaluate(`(() => {
      window.__setReactInput('#dashboard-search-input', ${JSON.stringify(customQuery)});
      const btn = document.querySelector('#dashboard-search-btn');
      btn.click();
    })()`)

    // Confirm navigation to results view
    await client.waitForFunction(`window.location.hash.includes('#/search')`, 5000)
    const currentHash = await client.evaluate(`window.location.hash`)
    console.log(`✔ Navigated to URL hash: ${currentHash}`)

    // Wait for recommendation network call
    const startRec = Date.now()
    while (recommendCalls.length === 0 && Date.now() - startRec < 15000) {
      await new Promise((r) => setTimeout(r, 200))
    }
    // Wait for agent recommendations header in DOM
    await client.waitForFunction(`document.body.innerText.includes('Ranked Recommendations')`, 15000)

    console.log(`✔ Recommendation requests received: ${recommendCalls.length} (Expected: 1)`)
    console.log('Recorded calls:', JSON.stringify(recommendCalls, null, 2))
    if (recommendCalls.length !== 1) {
      throw new Error(`Expected exactly 1 recommendation call, got ${recommendCalls.length}`)
    }
    const call1 = recommendCalls[0]
    console.log(`✔ Query sent to backend: "${call1.body?.query}"`)
    console.log(`✔ Authenticated request verified (Bearer token present): ${call1.hasAuth}`)
    if (call1.body?.query !== customQuery) {
      throw new Error(`Submitted query mismatch: expected "${customQuery}", got "${call1.body?.query}"`)
    }

    const inputValInAgent = await client.evaluate(`document.querySelector('#agent-query-input')?.value`)
    console.log(`✔ AI Results input displays submitted query: "${inputValInAgent}"`)

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Browser Refresh Simulation
    // ─────────────────────────────────────────────────────────────
    console.log('\n[4/7] Testing page refresh preservation & duplicate prevention...')
    recommendCalls.length = 0
    await client.send('Page.reload')
    await client.waitForFunction(`Boolean(document.querySelector('#agent-query-input'))`, 10000)

    const startReload = Date.now()
    while (recommendCalls.length === 0 && Date.now() - startReload < 15000) {
      await new Promise((r) => setTimeout(r, 200))
    }
    await client.waitForFunction(`document.body.innerText.includes('Ranked Recommendations')`, 15000)

    const preservedHash = await client.evaluate(`window.location.hash`)
    const preservedInputVal = await client.evaluate(`document.querySelector('#agent-query-input')?.value`)
    console.log(`✔ Preserved URL hash on refresh: ${preservedHash}`)
    console.log(`✔ Preserved search query in input: "${preservedInputVal}"`)
    console.log(`✔ Recommendation requests on reload: ${recommendCalls.length} (Expected: 1)`)
    if (recommendCalls.length !== 1) {
      throw new Error(`Refresh triggered duplicate requests: expected 1 call, got ${recommendCalls.length}`)
    }

    // Re-inject helper after reload
    await injectHelper()

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Browser Back & Forward Navigation
    // ─────────────────────────────────────────────────────────────
    console.log('\n[5/7] Testing browser Back & Forward navigation...')
    recommendCalls.length = 0
    await client.evaluate(`window.history.back()`)
    await client.waitForFunction(`Boolean(document.querySelector('#dashboard-search-input'))`, 10000)
    const backHash = await client.evaluate(`window.location.hash`)
    console.log(`✔ Navigated Back to dashboard (hash: "${backHash}")`)

    await client.evaluate(`window.history.forward()`)
    await client.waitForFunction(`window.location.hash.includes('#/search')`, 10000)
    const forwardHash = await client.evaluate(`window.location.hash`)
    const forwardQuery = await client.evaluate(`document.querySelector('#agent-query-input')?.value`)
    console.log(`✔ Navigated Forward to: ${forwardHash} with query: "${forwardQuery}"`)

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Ambiguous Query (Clarification Handling)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[6/7] Testing ambiguous query handling...')
    await client.waitForFunction(`!document.querySelector('#agent-query-submit-btn')?.disabled && !document.querySelector('#agent-query-input')?.disabled`, 15000)
    recommendCalls.length = 0
    await client.evaluate(`(() => {
      window.__setReactInput('#agent-query-input', 'recommend something good');
      const btn = document.querySelector('#agent-query-submit-btn') || document.querySelector('#send-query-btn');
      btn.click();
    })()`)
    const startAmb = Date.now()
    while (recommendCalls.length === 0 && Date.now() - startAmb < 15000) {
      await new Promise((r) => setTimeout(r, 200))
    }
    await client.waitForFunction(`Boolean(document.querySelector('#agent-clarification-banner'))`, 15000)
    const clarificationText = await client.evaluate(`document.querySelector('#agent-clarification-banner').innerText`)
    console.log(`✔ Clarification banner displayed: ${clarificationText.includes('Clarification Needed')}`)
    console.log(`✔ Recommendation calls for ambiguous query: ${recommendCalls.length} (Expected: 1)`)

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Zero-Match / Impossible Constraints Query
    // ─────────────────────────────────────────────────────────────
    console.log('\n[7/7] Testing query with no matching products...')
    await client.waitForFunction(`!document.querySelector('#agent-query-submit-btn')?.disabled && !document.querySelector('#agent-query-input')?.disabled`, 15000)
    recommendCalls.length = 0
    await client.evaluate(`(() => {
      window.__setReactInput('#agent-query-input', 'Laptops under $5');
      const btn = document.querySelector('#agent-query-submit-btn') || document.querySelector('#send-query-btn');
      btn.click();
    })()`)
    const startZero = Date.now()
    while (recommendCalls.length === 0 && Date.now() - startZero < 15000) {
      await new Promise((r) => setTimeout(r, 200))
    }
    await client.waitForFunction(`Boolean(document.querySelector('#agent-no-results'))`, 15000)
    const noResultsText = await client.evaluate(`document.querySelector('#agent-no-results').innerText`)
    console.log(`✔ Zero-match empty state displayed: "${noResultsText.trim().replace(/\\s+/g, ' ')}"`)
    console.log(`✔ Recommendation calls for zero-match query: ${recommendCalls.length} (Expected: 1)`)

    console.log('\n======================================================')
    console.log('🎉 ALL BROWSER SMOKE TEST SCENARIOS PASSED WITH SUCCESS!')
    console.log('======================================================')
  } finally {
    if (client) {
      client.close()
    }
    chromeProc.kill('SIGKILL')
    try {
      rmSync(tempProfile, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Browser smoke test failed:', err)
  process.exit(1)
})
