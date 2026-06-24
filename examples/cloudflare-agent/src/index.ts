import { generateText, stepCountIs } from 'ai'
import { Nominee } from 'nominee'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'

interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>
}
interface Env {
  AI: Ai
  EMAIL_RL: RateLimit
  RESEND_API_KEY?: string
  FROM: string
}

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const isEmail = (s: unknown): s is string =>
  typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) && s.length < 200

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  })

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/agent'

    // 1) the model DRAFTS an email from the task (no send yet)
    if (request.method === 'POST' && path.endsWith('/plan')) {
      const { task, to } = (await request.json().catch(() => ({}))) as {
        task?: string
        to?: string
      }
      if (!isEmail(to)) return json({ ok: false, reason: 'invalid_email' }, 400)
      const workersai = createWorkersAI({ binding: env.AI })
      try {
        const result = await generateText({
          model: workersai(MODEL),
          system:
            'You draft a short, friendly plain-text email from the user request. Always call the compose tool with a concise subject and body. Do not include a signature.',
          tools: {
            compose: {
              description: 'Compose the email to send',
              inputSchema: z.object({
                subject: z.string().describe('a short subject line'),
                body: z.string().describe('a concise plain-text body, 2-5 sentences'),
              }),
            },
          },
          stopWhen: stepCountIs(1),
          prompt: `Draft an email for this request: ${task || 'Say hello and that nominee works.'}`,
        })
        const call = result.toolCalls?.[0]
        if (!call) return json({ ok: false, reason: 'no_draft', text: result.text })
        const { subject, body } = call.input as { subject: string; body: string }
        return json({ ok: true, proposal: { to, subject, body } })
      } catch (err) {
        return json({ ok: false, reason: 'model_error', error: String(err) }, 500)
      }
    }

    // 2) the human DECIDED; on approval nominee brokers the key and we really send
    if (request.method === 'POST' && path.endsWith('/execute')) {
      const body = (await request.json().catch(() => ({}))) as {
        to?: string
        subject?: string
        body?: string
        decision?: 'approved' | 'denied'
      }
      if (!isEmail(body.to)) return json({ ok: false, reason: 'invalid_email' }, 400)
      const decision = body.decision === 'approved' ? 'approved' : 'denied'

      const audit: unknown[] = []
      const nominee = new Nominee({
        // nominee brokers the Resend API key — the agent code never holds it
        strategy: ({ connection }) =>
          connection === 'resend' ? (env.RESEND_API_KEY ?? '') : `mock-${connection}`,
        onApprovalRequest: (req) => nominee.resolveApproval(req.id, decision),
        onAudit: (e) => audit.push(e),
        agent: 'playground-agent',
      })

      try {
        await nominee.approve({ user: body.to, action: 'email.send', detail: { to: body.to } })
      } catch {
        return json({ ok: true, decision, sent: false, audit })
      }

      // rate-limit only the real, approved send
      const ip = request.headers.get('cf-connecting-ip') ?? 'anon'
      const { success } = await env.EMAIL_RL.limit({ key: ip })
      if (!success)
        return json(
          { ok: false, reason: 'rate_limited', message: 'Too many sends — try again in a minute.' },
          429,
        )

      const key = await nominee.token({ user: body.to, connection: 'resend' })
      if (!key)
        return json(
          {
            ok: false,
            reason: 'not_configured',
            message: 'RESEND_API_KEY is not set on the worker.',
            audit,
          },
          503,
        )

      const html = `<div style="font-family:system-ui,sans-serif;line-height:1.6">
        <p>${escapeHtml(body.body || '')}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0" />
        <p style="color:#888;font-size:13px">You triggered this from the <a href="https://nominee.dev/agent">nominee live testbed</a>. An AI agent drafted it; you approved it; nominee fetched the email-provider credential just-in-time to send it.</p>
      </div>`

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: env.FROM,
          to: [body.to],
          subject: body.subject || 'A note from your nominee agent',
          html,
        }),
      })
      const out = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
      if (!res.ok)
        return json(
          { ok: false, reason: 'send_failed', status: res.status, detail: out, audit },
          502,
        )
      return json({ ok: true, decision, sent: true, id: out.id, to: body.to, audit })
    }

    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  },
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m] as string)
}

const html = /* html */ `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>nominee · live testbed</title>
<link rel="icon" href="https://nominee.dev/assets/icon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
:root{--ink:#0a1020;--raised:#0f1830;--hair:rgba(214,224,245,.12);--paper:#e8ecf6;--soft:#c4ccde;--muted:#7e8ba6;--seal:#d9a441;--sans:'Schibsted Grotesk',system-ui,sans-serif;--mono:'Geist Mono',ui-monospace,monospace}
*{margin:0;box-sizing:border-box}body{font-family:var(--sans);background:radial-gradient(900px 500px at 80% -10%,rgba(217,164,65,.08),transparent 60%),var(--ink);color:var(--paper);min-height:100vh;line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:clamp(28px,6vw,64px) 22px 80px}
.eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--seal);margin-bottom:14px}
h1{font-size:clamp(28px,5vw,40px);letter-spacing:-.03em;margin-bottom:10px}
.lede{color:var(--muted);margin-bottom:28px}.lede a{color:var(--soft);border-bottom:1px solid var(--hair)}
.card{background:linear-gradient(180deg,var(--raised),#0c1428);border:1px solid var(--hair);border-radius:14px;padding:22px;margin-bottom:16px}
label{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:8px;margin-top:14px}
label:first-child{margin-top:0}
input{width:100%;font-family:var(--mono);font-size:15px;color:var(--paper);background:rgba(255,255,255,.03);border:1px solid var(--hair);border-radius:9px;padding:13px 14px}
input:focus{outline:none;border-color:rgba(217,164,65,.5)}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;align-items:center}
button{font-family:var(--mono);font-size:14px;cursor:pointer;border-radius:9px;padding:12px 18px;border:1px solid var(--hair);background:rgba(255,255,255,.04);color:var(--paper);transition:.15s}
button:hover{border-color:rgba(217,164,65,.5)}button:disabled{opacity:.5;cursor:default}
.primary,.approve{background:var(--seal);color:#1a1205;border-color:var(--seal);font-weight:600}.deny{color:var(--soft)}
.log{font-family:var(--mono);font-size:13.5px;line-height:1.95;white-space:pre-wrap}
.log .m{color:var(--muted)}.log .ok{color:#7fd1a6}.log .err{color:#ff6b6b}.log .ac{color:var(--seal)}.log .hl{color:var(--paper)}
.draft{font-family:var(--mono);font-size:13.5px;background:#070c18;border:1px solid var(--hair);border-radius:10px;padding:14px;margin-top:6px}
.draft .s{color:var(--paper)}.draft .b{color:var(--soft);white-space:pre-wrap;display:block;margin-top:8px}
.sub{font-size:13px;color:var(--muted);margin-top:8px}
.jsontoggle{font-family:var(--mono);font-size:12px;color:var(--muted);background:none;border:none;border-bottom:1px solid var(--hair);padding:0 0 2px;border-radius:0;margin-top:16px}
pre{font-family:var(--mono);font-size:12px;color:var(--soft);background:#070c18;border:1px solid var(--hair);border-radius:10px;padding:14px;overflow:auto;margin-top:10px;max-height:320px}
.foot{margin-top:28px;font-family:var(--mono);font-size:12px;color:var(--muted);text-align:center}.foot a{color:var(--soft)}
.spin{display:inline-block;color:var(--seal)}
</style></head><body>
<div class="wrap">
  <p class="eyebrow">Live testbed · Cloudflare Workers AI</p>
  <h1>Try nominee yourself.</h1>
  <p class="lede">An AI agent drafts a real email; <strong>you</strong> approve it; nominee fetches the email-provider key just-in-time and actually sends it — with a full audit trail. <a href="https://nominee.dev">← nominee.dev</a></p>

  <div class="card">
    <label for="to">Your email (where the agent will send)</label>
    <input id="to" type="email" placeholder="you@example.com" />
    <label for="task">What should the agent say?</label>
    <input id="task" type="text" value="Remind me to review PR #42 tomorrow morning" />
    <div class="row"><button id="run" class="primary">Draft email ▸</button><span id="status" class="sub"></span></div>
  </div>

  <div id="proposal" class="card" hidden></div>
  <div id="result" class="card" hidden></div>

  <p class="foot">Sends only to the address you enter · rate-limited · clearly marked as a demo. <a href="https://github.com/bharath31/nominee">source ↗</a></p>
</div>
<script>
const $=s=>document.querySelector(s); let lastJSON={};
async function api(p,b){const r=await fetch('/agent'+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});return r.json()}
$('#run').addEventListener('click', run)
function esc(s){return String(s).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}
function jsonBtn(){return '<button class="jsontoggle" onclick="this.nextElementSibling.hidden=!this.nextElementSibling.hidden">show JSON</button><pre hidden>'+esc(JSON.stringify(lastJSON,null,2))+'</pre>'}
function line(c,t){return '<div><span class="'+c+'">'+esc(t)+'</span></div>'}

async function run(){
  const to=$('#to').value.trim(), task=$('#task').value.trim()
  if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(to)){$('#status').textContent='enter a valid email first';return}
  $('#run').disabled=true; $('#status').innerHTML='<span class="spin">●</span> drafting…'
  $('#proposal').hidden=true; $('#result').hidden=true
  const res=await api('/plan',{task,to}); lastJSON={plan:res}
  $('#run').disabled=false; $('#status').textContent=''
  if(!res.ok){$('#proposal').hidden=false;$('#proposal').innerHTML='<span class="log err">✗ couldn\\'t draft ('+esc(res.reason||'error')+'). Try again.</span>'+jsonBtn();return}
  const p=res.proposal
  $('#proposal').hidden=false
  $('#proposal').innerHTML=
    '<label>Agent wants to send</label>'+
    '<div class="draft"><span class="m">to</span> '+esc(p.to)+'<br><span class="s">'+esc(p.subject)+'</span><span class="b">'+esc(p.body)+'</span></div>'+
    '<p class="sub">Sending email is a sensitive action — nominee is holding it for your approval.</p>'+
    '<div class="row"><button class="approve" id="ap">✓ Approve & send</button><button class="deny" id="dn">Deny</button></div>'+jsonBtn()
  $('#ap').addEventListener('click',()=>decide(p,'approved'))
  $('#dn').addEventListener('click',()=>decide(p,'denied'))
}

async function decide(p,decision){
  $('#ap').disabled=true; $('#dn').disabled=true
  if(decision==='approved')$('#ap').innerHTML='<span class="spin">●</span> sending…'
  const res=await api('/execute',{to:p.to,subject:p.subject,body:p.body,decision}); lastJSON.execute=res
  $('#result').hidden=false
  let log=line('m','$ approval '+decision)
  if(decision==='approved'&&res.sent){
    log+=line('ac','⚸ approval required — you approved')
    log+=line('ok','✓ nominee brokered the email-provider key (agent never saw it)')
    log+=line('ok','✓ email sent to '+esc(res.to)+'  ·  id '+esc(res.id||''))
    log+=line('m','check your inbox ✉')
  } else if(decision==='denied'){
    log+=line('err','✗ denied — nothing sent')
  } else {
    log+=line('err','✗ '+esc(res.message||res.reason||'not sent'))
  }
  log+='\\n'+line('m','audit  '+((res.audit||[]).map(e=>e.type).join(' → ')||'—'))
  $('#result').innerHTML='<label>Result</label><div class="log">'+log+'</div>'+jsonBtn()
  $('#ap').innerHTML='✓ Approve & send'
}
</script>
</body></html>`
