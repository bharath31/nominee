export const CONSOLE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>nominee console</title>
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body>
    <div class="frame" aria-hidden="true"></div>
    <header class="topbar">
      <a class="wordmark" href="/" aria-label="nominee console home">
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="1">
            <circle cx="20" cy="20" r="15"></circle>
            <circle cx="20" cy="20" r="11" opacity=".5"></circle>
            <ellipse cx="20" cy="20" rx="15" ry="5" opacity=".42"></ellipse>
            <ellipse cx="20" cy="20" rx="15" ry="5" opacity=".42" transform="rotate(60 20 20)"></ellipse>
            <ellipse cx="20" cy="20" rx="15" ry="5" opacity=".42" transform="rotate(120 20 20)"></ellipse>
          </g>
        </svg>
        <span>nominee</span>
        <em>console</em>
      </a>
      <div class="connection" data-connection><span></span> connecting</div>
    </header>

    <main>
      <section class="hero">
        <div>
          <p class="eyebrow">Local action boundary</p>
          <h1>See every decision.<br />Settle the risky ones.</h1>
          <p class="lede">A loopback-only view of observed authority, pending approvals, and the receipt chain. No account and no cloud relay.</p>
        </div>
        <div class="hero-actions">
          <button type="button" class="primary" data-generate disabled>Write starter policy</button>
          <p data-policy-result>Load or publish an observation report to generate a policy.</p>
        </div>
      </section>

      <section class="metrics" aria-label="Observation summary">
        <article><span>Tool calls</span><strong data-metric="calls">—</strong><small>observed in this window</small></article>
        <article><span>Mutating calls</span><strong data-metric="mutations">—</strong><small data-mutation-note>classified from tool names</small></article>
        <article><span>Unbounded tools</span><strong data-metric="unbounded">—</strong><small data-unbounded-note>arguments without observed limits</small></article>
        <article><span>Policy denies</span><strong data-metric="denies">—</strong><small data-deny-note>not measured yet</small></article>
      </section>

      <section class="layout">
        <article class="panel approvals-panel">
          <div class="panel-head">
            <div><p class="kicker">Human gate</p><h2>Pending approvals</h2></div>
            <span class="count" data-approval-count>0 waiting</span>
          </div>
          <div class="approval-list" data-approvals>
            <div class="empty"><strong>Nothing is waiting.</strong><span>Ask decisions from a connected agent appear here.</span></div>
          </div>
        </article>

        <article class="panel activity-panel">
          <div class="panel-head">
            <div><p class="kicker">Live tail</p><h2>Decision activity</h2></div>
            <span class="pulse" aria-label="live"></span>
          </div>
          <ol class="activity" data-activity>
            <li class="empty"><strong>Waiting for a connected process.</strong><span>Observations, receipts, and approvals stream here.</span></li>
          </ol>
        </article>

        <article class="panel tools-panel">
          <div class="panel-head">
            <div><p class="kicker">Observed surface</p><h2>Tools and argument shapes</h2></div>
            <span class="count" data-tool-count>0 tools</span>
          </div>
          <div class="tools" data-tools>
            <div class="empty"><strong>No report loaded.</strong><span>Run nominee in observe mode and publish or load its report.</span></div>
          </div>
        </article>

        <article class="panel receipts-panel">
          <div class="panel-head">
            <div><p class="kicker">Tamper evidence</p><h2>Receipt chains</h2></div>
            <span class="count" data-receipt-count>0 receipts</span>
          </div>
          <div class="chains" data-chains>
            <div class="empty"><strong>No receipts yet.</strong><span>Connect receipts.onReceipt to tail and verify decisions.</span></div>
          </div>
          <aside class="integrity-note">
            <strong>What verification proves</strong>
            <p>A valid chain detects edits inside the supplied sequence. It does not prove the sequence is complete, that execution occurred outside nominee, or that an unsigned chain could not be recomputed. HMAC verification also depends on independent key custody.</p>
          </aside>
        </article>
      </section>

      <section class="local-note">
        <span>127.0.0.1</span>
        <p>Approval details stay in this process’s memory and are removed after settlement. Observation reports contain bounded aggregates, not raw strings or user IDs.</p>
      </section>
    </main>

    <footer><span>nominee console</span><p>Local development surface · enforcement remains in your agent process</p></footer>
    <script src="/app.js" defer></script>
  </body>
</html>`

export const CONSOLE_CSS = `
:root {
  --paper: #faf9f5;
  --paper-deep: #f1eee6;
  --ink: #0b1020;
  --muted: #626776;
  --rule: rgba(11, 16, 32, .15);
  --seal: #8c2f2a;
  --seal-soft: #f3e5e1;
  --ok: #1f6b4a;
  --ok-soft: #e4f0e9;
  --ask: #9a681b;
  --ask-soft: #f5ecd9;
  --shadow: 0 18px 60px rgba(25, 28, 38, .08);
}
* { box-sizing: border-box; }
html { background: var(--paper); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { margin: 0; min-height: 100vh; background:
  linear-gradient(rgba(11,16,32,.025) 1px, transparent 1px),
  linear-gradient(90deg, rgba(11,16,32,.025) 1px, transparent 1px), var(--paper);
  background-size: 32px 32px;
}
.frame { position: fixed; inset: 10px; border: 1px solid rgba(11,16,32,.12); pointer-events: none; z-index: 10; }
.topbar { height: 76px; padding: 0 max(28px, calc((100vw - 1240px) / 2)); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--rule); background: rgba(250,249,245,.9); backdrop-filter: blur(14px); position: sticky; top: 0; z-index: 5; }
.wordmark { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--ink); font-weight: 760; letter-spacing: -.03em; font-size: 19px; }
.wordmark svg { width: 31px; color: var(--seal); }
.wordmark em { font-style: normal; font: 500 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); border-left: 1px solid var(--rule); padding-left: 10px; }
.connection { display: flex; align-items: center; gap: 8px; text-transform: uppercase; letter-spacing: .1em; font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); }
.connection span { width: 7px; height: 7px; border-radius: 50%; background: var(--ask); box-shadow: 0 0 0 4px var(--ask-soft); }
.connection.live span { background: var(--ok); box-shadow: 0 0 0 4px var(--ok-soft); }
main { max-width: 1240px; margin: 0 auto; padding: 76px 28px 56px; }
.hero { display: grid; grid-template-columns: 1fr auto; gap: 56px; align-items: end; padding-bottom: 52px; }
.eyebrow, .kicker { margin: 0 0 15px; color: var(--seal); text-transform: uppercase; letter-spacing: .13em; font: 650 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
h1 { margin: 0; max-width: 750px; font-family: Georgia, "Times New Roman", serif; font-size: clamp(48px, 6vw, 84px); line-height: .98; font-weight: 500; letter-spacing: -.05em; }
.lede { margin: 25px 0 0; max-width: 680px; color: var(--muted); font-size: 17px; line-height: 1.65; }
.hero-actions { width: 250px; padding-bottom: 8px; }
button { font: inherit; }
button.primary { width: 100%; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); padding: 13px 17px; border-radius: 3px; font-weight: 680; cursor: pointer; box-shadow: 4px 4px 0 var(--seal); transition: transform .15s, box-shadow .15s; }
button.primary:hover:not(:disabled) { transform: translate(2px,2px); box-shadow: 2px 2px 0 var(--seal); }
button:disabled { opacity: .42; cursor: not-allowed; }
.hero-actions p { margin: 12px 0 0; font-size: 12px; line-height: 1.5; color: var(--muted); }
.metrics { display: grid; grid-template-columns: repeat(4,1fr); border: 1px solid var(--rule); box-shadow: var(--shadow); background: rgba(255,255,255,.56); }
.metrics article { padding: 22px 24px; min-height: 134px; border-right: 1px solid var(--rule); display: flex; flex-direction: column; }
.metrics article:last-child { border-right: 0; }
.metrics span { font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.metrics strong { margin-top: auto; font: 520 42px/.95 Georgia, serif; letter-spacing: -.04em; }
.metrics small { margin-top: 8px; color: var(--muted); font-size: 11px; }
.layout { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(320px, .7fr); gap: 18px; margin-top: 18px; align-items: start; }
.panel { background: rgba(255,255,255,.62); border: 1px solid var(--rule); box-shadow: 0 8px 30px rgba(25,28,38,.04); }
.panel-head { min-height: 88px; padding: 20px 22px; border-bottom: 1px solid var(--rule); display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.panel-head .kicker { margin-bottom: 8px; }
h2 { margin: 0; font-family: Georgia, serif; font-size: 24px; font-weight: 520; letter-spacing: -.025em; }
.count { color: var(--muted); white-space: nowrap; font: 550 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; letter-spacing: .08em; }
.pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 5px var(--ok-soft); }
.empty { min-height: 140px; padding: 30px 22px; display: flex; flex-direction: column; justify-content: center; gap: 7px; color: var(--muted); }
.empty strong { color: var(--ink); font-family: Georgia, serif; font-size: 18px; font-weight: 520; }
.empty span { font-size: 13px; line-height: 1.5; }
.approval-list { display: grid; }
.approval { padding: 22px; border-bottom: 1px solid var(--rule); }
.approval:last-child { border-bottom: 0; }
.approval-top { display: flex; justify-content: space-between; gap: 16px; }
.approval-action { font: 650 14px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.approval-user { color: var(--muted); font-size: 12px; }
.approval pre { margin: 16px 0; padding: 14px; max-height: 210px; overflow: auto; background: var(--paper-deep); border: 1px solid var(--rule); white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
.approval-actions { display: flex; gap: 8px; justify-content: flex-end; }
.approval-actions button { border: 1px solid var(--rule); background: var(--paper); padding: 8px 13px; border-radius: 3px; font-weight: 650; cursor: pointer; }
.approval-actions .approve { background: var(--ok); border-color: var(--ok); color: white; }
.approval-actions .deny { color: var(--seal); border-color: rgba(140,47,42,.35); }
.activity-panel { position: sticky; top: 94px; }
.activity { list-style: none; margin: 0; padding: 0; max-height: 430px; overflow: auto; }
.activity li:not(.empty) { display: grid; grid-template-columns: 66px 1fr; gap: 13px; padding: 14px 18px; border-bottom: 1px solid var(--rule); }
.activity li:last-child { border-bottom: 0; }
.activity time { color: var(--muted); font: 10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.activity strong { display: block; font-size: 12px; line-height: 1.35; }
.activity span { display: block; color: var(--muted); font-size: 11px; margin-top: 3px; overflow-wrap: anywhere; }
.tools-panel, .receipts-panel { grid-column: 1 / -1; }
.tools { overflow-x: auto; }
.tool { display: grid; grid-template-columns: minmax(190px, .8fr) 100px 110px minmax(260px, 1.4fr); border-bottom: 1px solid var(--rule); min-width: 760px; }
.tool:last-child { border-bottom: 0; }
.tool > div { padding: 17px 20px; border-right: 1px solid var(--rule); }
.tool > div:last-child { border-right: 0; }
.tool-name { font: 650 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.tool-meta { font-size: 12px; color: var(--muted); }
.badge { display: inline-block; padding: 5px 8px; border-radius: 999px; font: 650 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; background: var(--paper-deep); }
.badge.read, .badge.valid { color: var(--ok); background: var(--ok-soft); }
.badge.mutate, .badge.invalid { color: var(--seal); background: var(--seal-soft); }
.badge.unknown, .badge.segment, .badge.key { color: var(--ask); background: var(--ask-soft); }
.args { display: flex; flex-wrap: wrap; gap: 6px; }
.arg { border: 1px solid var(--rule); background: var(--paper); padding: 5px 7px; font: 10px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
.arg.unbounded { border-color: rgba(140,47,42,.35); color: var(--seal); }
.chains { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
.chain { padding: 20px 22px; border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
.chain-top { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
.chain h3 { margin: 0; font: 650 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.chain p { color: var(--muted); font-size: 11px; line-height: 1.5; margin: 9px 0 0; }
.receipt-list { list-style: none; padding: 0; margin: 16px 0 0; }
.receipt-list li { display: grid; grid-template-columns: 34px 1fr auto; gap: 9px; padding: 8px 0; border-top: 1px solid var(--rule); font: 10px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
.receipt-list span { color: var(--muted); }
.integrity-note { margin: 0; padding: 20px 22px; background: var(--paper-deep); border-top: 1px solid var(--rule); }
.integrity-note strong { font-size: 12px; }
.integrity-note p { margin: 7px 0 0; max-width: 950px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.local-note { margin-top: 18px; border: 1px dashed rgba(11,16,32,.25); padding: 16px 18px; display: flex; align-items: start; gap: 18px; }
.local-note span { color: var(--ok); background: var(--ok-soft); padding: 5px 8px; font: 650 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.local-note p { margin: 1px 0 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
footer { max-width: 1240px; margin: 0 auto; padding: 26px 28px 42px; border-top: 1px solid var(--rule); display: flex; justify-content: space-between; gap: 20px; font-size: 11px; color: var(--muted); }
footer span { color: var(--ink); font-weight: 700; }
@media (max-width: 860px) {
  .hero { grid-template-columns: 1fr; gap: 28px; }
  .hero-actions { width: 100%; max-width: 360px; }
  .metrics { grid-template-columns: repeat(2,1fr); }
  .metrics article:nth-child(2) { border-right: 0; }
  .metrics article:nth-child(-n+2) { border-bottom: 1px solid var(--rule); }
  .layout { grid-template-columns: 1fr; }
  .tools-panel, .receipts-panel { grid-column: auto; }
  .activity-panel { position: static; }
}
@media (max-width: 540px) {
  .topbar { padding: 0 22px; }
  .wordmark em { display: none; }
  main { padding: 52px 20px 40px; }
  h1 { font-size: 48px; }
  .metrics { grid-template-columns: 1fr; }
  .metrics article { border-right: 0; border-bottom: 1px solid var(--rule); }
  .metrics article:last-child { border-bottom: 0; }
  .local-note { flex-direction: column; gap: 10px; }
  footer { margin: 0 20px; padding-inline: 0; flex-direction: column; }
}
`

export const CONSOLE_JS = `
(() => {
  const one = (selector) => document.querySelector(selector)
  const connection = one('[data-connection]')
  const generate = one('[data-generate]')
  const policyResult = one('[data-policy-result]')
  let csrf = ''

  function text(node, value) { if (node) node.textContent = String(value) }
  function empty(title, detail) {
    const item = document.createElement('div')
    item.className = 'empty'
    const strong = document.createElement('strong')
    const span = document.createElement('span')
    strong.textContent = title
    span.textContent = detail
    item.append(strong, span)
    return item
  }
  function badge(label, kind) {
    const item = document.createElement('span')
    item.className = 'badge ' + kind
    item.textContent = label
    return item
  }
  function clock(at) {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  async function decide(id, decision) {
    const response = await fetch('/api/approvals/' + encodeURIComponent(id) + '/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nominee-csrf': csrf },
      body: JSON.stringify({ decision }),
    })
    if (!response.ok) throw new Error(await response.text())
  }

  function renderApprovals(items) {
    const root = one('[data-approvals]')
    root.replaceChildren()
    text(one('[data-approval-count]'), items.length + (items.length === 1 ? ' waiting' : ' waiting'))
    if (!items.length) {
      root.append(empty('Nothing is waiting.', 'Ask decisions from a connected agent appear here.'))
      return
    }
    for (const approval of items) {
      const card = document.createElement('section')
      card.className = 'approval'
      const top = document.createElement('div')
      top.className = 'approval-top'
      const action = document.createElement('strong')
      action.className = 'approval-action'
      action.textContent = approval.action
      const user = document.createElement('span')
      user.className = 'approval-user'
      user.textContent = 'for ' + approval.user
      top.append(action, user)
      const detail = document.createElement('pre')
      detail.textContent = approval.detail === undefined ? 'No arguments supplied.' : JSON.stringify(approval.detail, null, 2)
      const actions = document.createElement('div')
      actions.className = 'approval-actions'
      for (const decision of ['denied', 'approved']) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = decision === 'approved' ? 'approve' : 'deny'
        button.textContent = decision === 'approved' ? 'Approve once' : 'Deny'
        button.addEventListener('click', async () => {
          button.disabled = true
          try { await decide(approval.id, decision) }
          catch (error) { button.disabled = false; policyResult.textContent = error.message }
        })
        actions.append(button)
      }
      card.append(top, detail, actions)
      root.append(card)
    }
  }

  function renderTools(items, total, lowerBound) {
    const root = one('[data-tools]')
    root.replaceChildren()
    const totalLabel = (lowerBound ? 'at least ' : '') + total + (total === 1 ? ' tool' : ' tools')
    text(one('[data-tool-count]'), items.length === total ? totalLabel : totalLabel + ' · ' + items.length + ' detailed')
    if (!items.length) {
      root.append(empty('No report loaded.', 'Run nominee in observe mode and publish or load its report.'))
      return
    }
    for (const tool of items) {
      const row = document.createElement('div')
      row.className = 'tool'
      const name = document.createElement('div')
      name.className = 'tool-name'
      name.textContent = tool.tool
      const calls = document.createElement('div')
      calls.className = 'tool-meta'
      calls.textContent = tool.calls + (tool.calls === 1 ? ' call' : ' calls')
      const kind = document.createElement('div')
      kind.append(badge(tool.kind, tool.kind))
      const args = document.createElement('div')
      args.className = 'args'
      if (!tool.arguments.length) {
        const none = document.createElement('span')
        none.className = 'tool-meta'
        none.textContent = 'no arguments observed'
        args.append(none)
      }
      for (const argument of tool.arguments) {
        const arg = document.createElement('span')
        arg.className = 'arg' + (argument.unbounded ? ' unbounded' : '')
        const range = argument.range ? ' · ' + argument.range.min + '–' + argument.range.max + ' · median ' + argument.range.median : ''
        arg.textContent = argument.name + ' · ' + argument.types.join('|') + range + (argument.unbounded ? ' · unbounded' : '')
        args.append(arg)
      }
      row.append(name, calls, kind, args)
      root.append(row)
    }
  }

  function renderActivity(items) {
    const root = one('[data-activity]')
    root.replaceChildren()
    if (!items.length) {
      root.append(empty('Waiting for a connected process.', 'Observations, receipts, and approvals stream here.'))
      return
    }
    for (const event of items.slice().reverse()) {
      const item = document.createElement('li')
      const at = document.createElement('time')
      at.textContent = clock(event.at)
      const body = document.createElement('div')
      const title = document.createElement('strong')
      const detail = document.createElement('span')
      title.textContent = event.label
      detail.textContent = event.detail || ''
      body.append(title, detail)
      item.append(at, body)
      root.append(item)
    }
  }

  function renderChains(chains) {
    const root = one('[data-chains]')
    root.replaceChildren()
    const total = chains.reduce((sum, chain) => sum + chain.receipts.length, 0)
    text(one('[data-receipt-count]'), total + (total === 1 ? ' receipt' : ' receipts'))
    if (!chains.length) {
      root.append(empty('No receipts yet.', 'Connect receipts.onReceipt to tail and verify decisions.'))
      return
    }
    for (const chain of chains) {
      const card = document.createElement('section')
      card.className = 'chain'
      const top = document.createElement('div')
      top.className = 'chain-top'
      const title = document.createElement('h3')
      title.textContent = chain.stream
      const verdictKind = chain.verification.kind === 'valid-hmac' || chain.verification.kind === 'valid-unsigned' ? 'valid' : chain.verification.kind === 'segment-valid' ? 'segment' : chain.verification.kind === 'key-required' ? 'key' : 'invalid'
      top.append(title, badge(chain.verification.label, verdictKind))
      const explanation = document.createElement('p')
      explanation.textContent = chain.verification.detail
      const list = document.createElement('ol')
      list.className = 'receipt-list'
      for (const receipt of chain.receipts.slice(-8).reverse()) {
        const item = document.createElement('li')
        const seq = document.createElement('span')
        const type = document.createElement('strong')
        const hash = document.createElement('span')
        seq.textContent = '#' + receipt.seq
        const verdict = [receipt.effect, receipt.decision, receipt.outcome].filter(Boolean).join(' · ')
        type.textContent = receipt.type + (receipt.tool ? ' · ' + receipt.tool : '') + (verdict ? ' · ' + verdict : '')
        hash.textContent = receipt.hash
        item.append(seq, type, hash)
        list.append(item)
      }
      card.append(top, explanation, list)
      root.append(card)
    }
  }

  function render(state) {
    csrf = state.csrf
    const lowerBound = state.headlines.toolDetailsIncomplete ? '≥' : ''
    text(one('[data-metric="calls"]'), state.headlines.calls)
    text(one('[data-metric="mutations"]'), lowerBound + state.headlines.mutatingCalls)
    text(one('[data-metric="unbounded"]'), lowerBound + state.headlines.unboundedTools)
    text(one('[data-mutation-note]'), state.headlines.toolDetailsIncomplete ? 'lower bound · some called tools were not detailed' : 'classified from tool names')
    text(one('[data-unbounded-note]'), state.headlines.toolDetailsIncomplete ? 'lower bound · some called tools were not detailed' : 'arguments without observed limits')
    text(one('[data-metric="denies"]'), state.headlines.denies.value === null ? '—' : state.headlines.denies.value)
    text(one('[data-deny-note]'), state.headlines.denies.note)
    generate.disabled = !state.canGeneratePolicy
    if (state.canGeneratePolicy && policyResult.textContent.startsWith('Load or publish')) {
      policyResult.textContent = 'Ready to write an editable policy from this observed evidence.'
    }
    renderApprovals(state.approvals)
    renderTools(state.tools, state.headlines.toolCount, state.headlines.toolCountLowerBound)
    renderActivity(state.activity)
    renderChains(state.chains)
  }

  generate.addEventListener('click', async () => {
    generate.disabled = true
    policyResult.textContent = 'Writing without overwriting…'
    try {
      const response = await fetch('/api/policy', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-nominee-csrf': csrf },
        body: '{}',
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not write policy')
      policyResult.textContent = 'Written to ' + result.path + '. Review every observed threshold.'
    } catch (error) {
      policyResult.textContent = error.message
      generate.disabled = false
    }
  })

  fetch('/api/state').then((response) => response.json()).then(render).catch(() => {})
  const events = new EventSource('/api/events')
  events.addEventListener('open', () => { connection.classList.add('live'); connection.lastChild.textContent = ' live' })
  events.addEventListener('error', () => { connection.classList.remove('live'); connection.lastChild.textContent = ' reconnecting' })
  events.addEventListener('state', (event) => render(JSON.parse(event.data)))
})()
`
