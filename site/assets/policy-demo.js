;(() => {
  const root = document.querySelector('[data-policy-demo]')
  if (!root) return

  const states = {
    25: {
      effect: 'allow',
      title: 'The agent may refund $25',
      copy: '<code>refund.issue</code> ran.',
    },
    200: {
      effect: 'ask',
      title: 'The agent is waiting for you',
      copy: '<code>refund.issue</code> has not run. Approve or deny it.',
    },
    2000: {
      effect: 'deny',
      title: 'The agent is blocked',
      copy: '<code>refund.issue</code> was never called.',
    },
  }

  const amountValue = root.querySelector('[data-amount-value]')
  const result = root.querySelector('[data-policy-result]')
  const effect = root.querySelector('[data-result-effect]')
  const title = root.querySelector('[data-result-title]')
  const copy = root.querySelector('[data-result-copy]')
  const approve = root.querySelector('[data-approve]')
  const buttons = Array.from(root.querySelectorAll('[data-amount]'))
  const rules = Array.from(root.querySelectorAll('[data-rule]'))
  let selected = 200

  const render = () => {
    const state = states[selected]
    if (!state) return

    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.amount) === selected))
    }
    for (const rule of rules) rule.classList.toggle('active', rule.dataset.rule === state.effect)

    amountValue.textContent = String(selected)
    result.className = `policy-result ${state.effect}`
    effect.textContent = state.effect
    title.textContent = state.title
    copy.innerHTML = state.copy
    approve.hidden = state.effect !== 'ask'
    approve.textContent = `Approve $${selected}`
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      selected = Number(button.dataset.amount)
      render()
    })
  }

  approve.addEventListener('click', () => {
    result.className = 'policy-result allow'
    effect.textContent = 'allow'
    title.textContent = 'Approved once. Refund issued.'
    copy.innerHTML = `<code>refund.issue</code> ran for $${selected}.`
    approve.hidden = true
  })

  render()
})()
