;(() => {
  const DEFAULT_POLICY = `[
  allow('orders.read'),

  allow('refund.issue', {
    when: ({ input }) => input.amount <= 50,
  }),

  ask('refund.issue', {
    when: ({ input }) => input.amount <= 500,
  }),

  deny('refund.issue'),
  deny('customers.export'),
]`

  const runtime = document.querySelector('[data-runtime]')
  const runtimeCopy = document.querySelector('[data-runtime-copy]')
  const editor = document.querySelector('[data-policy]')
  const runButton = document.querySelector('[data-run]')
  const resetButton = document.querySelector('[data-reset]')
  const amountButtons = Array.from(document.querySelectorAll('[data-play-amount]'))
  const conversation = document.querySelector('[data-conversation]')
  const agentState = document.querySelector('[data-agent-state]')
  const approval = document.querySelector('[data-approval]')
  const approvalCopy = document.querySelector('[data-approval-copy]')
  const approveButton = document.querySelector('[data-approve]')
  const denyButton = document.querySelector('[data-deny]')
  const receiptList = document.querySelector('[data-receipts]')
  const receiptVerdict = document.querySelector('[data-receipt-verdict]')

  if (!runtime || !editor || !runButton || !conversation) return

  editor.value = DEFAULT_POLICY
  let amount = 200
  let ready = false
  let running = false
  let runId = 0

  function track(event) {
    fetch('/agent/funnel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event }),
      keepalive: true,
    }).catch(() => {})
  }

  const worker = new Worker('/playground/runner.js', { type: 'module' })

  function setBusy(value) {
    running = value
    runButton.disabled = !ready || value
    editor.disabled = value
    resetButton.disabled = value
    for (const button of amountButtons) button.disabled = value
  }

  function setState(label, kind = '') {
    agentState.textContent = label
    agentState.className = `agent-state ${kind}`.trim()
  }

  function appendMessage(label, text, kind = 'agent') {
    const item = document.createElement('div')
    item.className = `message ${kind}`
    const who = document.createElement('span')
    who.textContent = label
    const copy = document.createElement('p')
    copy.textContent = text
    item.append(who, copy)
    conversation.appendChild(item)
    conversation.scrollTop = conversation.scrollHeight
  }

  function renderReceipts(receipts, verified) {
    receiptList.replaceChildren()
    for (const receipt of receipts) {
      const item = document.createElement('li')
      const seq = document.createElement('span')
      seq.className = 'receipt-seq'
      seq.textContent = `#${receipt.seq}`
      const event = document.createElement('span')
      event.className = 'receipt-event'
      event.textContent = receipt.type
      const tool = document.createElement('span')
      tool.className = 'receipt-tool'
      tool.textContent = receipt.tool || '—'
      const effect = document.createElement('span')
      const verdict = receipt.effect || receipt.decision || receipt.outcome || 'sealed'
      effect.className = `receipt-effect ${verdict}`
      effect.textContent = `${verdict} ·${receipt.hash}`
      item.append(seq, event, tool, effect)
      receiptList.appendChild(item)
    }
    receiptVerdict.textContent = verified
      ? `✓ ${receipts.length} visible receipts verify`
      : 'Receipt verification failed'
    receiptVerdict.className = `receipt-verdict ${verified ? 'ok' : 'bad'}`
  }

  function finish(label, kind) {
    approval.hidden = true
    setBusy(false)
    setState(label, kind)
  }

  worker.addEventListener('message', ({ data }) => {
    if (data.type === 'ready') {
      ready = true
      runtime.className = 'runtime-status ready'
      runtimeCopy.textContent = 'nominee@2.2.1 loaded · real policy engine'
      setBusy(false)
      return
    }

    if (data.type === 'load-error') {
      runtime.className = 'runtime-status error'
      runtimeCopy.textContent = 'Could not load nominee. Check your connection and reload.'
      setState('load failed', 'blocked')
      return
    }

    if (data.runId !== runId) return

    if (data.type === 'step') {
      appendMessage('Agent', data.text)
      return
    }

    if (data.type === 'approval') {
      track('playground_approval_requested')
      approvalCopy.textContent = `Refund $${data.amount.toLocaleString()} for ord_42?`
      approval.hidden = false
      setState('waiting for you', 'running')
      appendMessage('Nominee', 'Policy returned ask. refund.issue has not run.', 'blocked')
      if (data.receipts) renderReceipts(data.receipts, data.verified)
      return
    }

    if (data.type === 'executed') {
      appendMessage('Tool', data.text, 'allowed')
      return
    }

    if (data.type === 'blocked') {
      track('playground_blocked')
      appendMessage('Nominee', data.text, 'blocked')
      if (data.receipts) renderReceipts(data.receipts, data.verified)
      finish('blocked before tool', 'blocked')
      return
    }

    if (data.type === 'complete') {
      track('playground_allowed')
      appendMessage('Agent', data.text, 'allowed')
      if (data.receipts) renderReceipts(data.receipts, data.verified)
      finish('tool executed', 'allowed')
      return
    }

    if (data.type === 'policy-error') {
      appendMessage('Policy error', data.text, 'blocked')
      receiptVerdict.textContent = 'Fix the policy and run again.'
      receiptVerdict.className = 'receipt-verdict bad'
      finish('policy error', 'blocked')
    }
  })

  worker.addEventListener('error', () => {
    runtime.className = 'runtime-status error'
    runtimeCopy.textContent = 'The playground worker stopped. Reload to retry.'
    setBusy(false)
  })

  for (const button of amountButtons) {
    button.addEventListener('click', () => {
      amount = Number(button.dataset.playAmount)
      for (const candidate of amountButtons) {
        candidate.setAttribute(
          'aria-pressed',
          String(Number(candidate.dataset.playAmount) === amount),
        )
      }
    })
  }

  resetButton.addEventListener('click', () => {
    editor.value = DEFAULT_POLICY
    editor.focus()
  })

  runButton.addEventListener('click', () => {
    if (!ready || running) return
    runId += 1
    track('playground_run')
    approval.hidden = true
    setBusy(true)
    setState('running', 'running')
    appendMessage('Agent', `Requesting refund.issue({ orderId: 'ord_42', amount: ${amount} })`)
    worker.postMessage({ type: 'run', runId, amount, source: editor.value })
  })

  approveButton.addEventListener('click', () => {
    track('playground_approved')
    approval.hidden = true
    setState('resuming', 'running')
    appendMessage('You', `Approved the $${amount.toLocaleString()} refund once.`, 'customer')
    worker.postMessage({ type: 'decision', runId, decision: 'approved' })
  })

  denyButton.addEventListener('click', () => {
    track('playground_denied')
    approval.hidden = true
    setState('denying', 'running')
    appendMessage('You', `Denied the $${amount.toLocaleString()} refund.`, 'customer')
    worker.postMessage({ type: 'decision', runId, decision: 'denied' })
  })
})()
