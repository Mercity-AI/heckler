import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, ChevronDown, CircleAlert, Cloud, FlaskConical, Globe, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../lib/api'
import { EXAMPLE_AGENTS } from '../lib/examples'
import { cn } from '../lib/format'
import { keys, useConfig } from '../lib/queries'
import type { ConnectionTestResult, EvaluatorConnection, ProbeResult, Target, TargetConnection, TargetCreate } from '../lib/types'
import { Button } from './ui/button'
import { Chip, Field, Input, Segmented, Switch, Textarea } from './ui/primitives'

type Kind = TargetConnection['kind']

const EASE = [0.22, 1, 0.36, 1] as const
const collapse = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.28, ease: EASE },
}

function SectionHead({ n, title, sub }: { n: number; title: string; sub: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-px grid size-6 shrink-0 place-items-center rounded-full bg-ink font-mono text-[11px] text-white">{n}</span>
      <div>
        <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{sub}</p>
      </div>
    </div>
  )
}

function KeyHint({ saved }: { saved: boolean }) {
  if (saved) return <>A key is saved. Leave blank to keep it.</>
  return <>Stored on the server and never shown again.</>
}

function ProbeLine({ label, r }: { label: string; r: ProbeResult }) {
  return (
    <div className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px]', r.ok ? 'bg-pass-soft/60' : 'bg-fail-soft/70')}>
      {r.ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-pass" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-fail" />}
      <div className="min-w-0">
        <span className={cn('font-medium', r.ok ? 'text-pass' : 'text-fail')}>
          {label} {r.ok ? `replied in ${r.latency_ms} ms` : 'did not respond'}
        </span>
        <p className="mt-0.5 line-clamp-2 break-words text-ink-2">{r.ok ? (r.reply ? `“${r.reply}”` : '') : r.error}</p>
      </div>
    </div>
  )
}

/**
 * Connect (or edit) an agent: the agent under test, and the evaluator model that plays its users and
 * grades the conversations. Both run on keys the user brings.
 */
export function AgentForm({ initial, submitLabel, onSaved }: { initial?: Target; submitLabel?: string; onSaved: (t: Target) => void }) {
  const qc = useQueryClient()
  const config = useConfig()
  const suggested = config.data?.suggested_evaluator
  const ic = initial?.connection
  const ie = initial?.evaluator ?? null

  const [name, setName] = useState(initial?.name ?? '')
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? '')
  const [kind, setKind] = useState<Kind>(ic?.kind ?? 'openai_chat')

  // openai_chat
  const [baseUrl, setBaseUrl] = useState(ic?.kind === 'openai_chat' ? ic.base_url : 'https://openrouter.ai/api/v1')
  const [model, setModel] = useState(ic?.kind === 'openai_chat' ? ic.model : '')
  const [apiKey, setApiKey] = useState('')
  const [sendPrompt, setSendPrompt] = useState(ic?.kind === 'openai_chat' ? (ic.send_system_prompt ?? true) : true)
  const [maxTokens, setMaxTokens] = useState(String(ic?.kind === 'openai_chat' ? (ic.max_tokens ?? 16384) : 16384))
  const [temperature, setTemperature] = useState(ic?.kind === 'openai_chat' && ic.temperature != null ? String(ic.temperature) : '')
  const [advanced, setAdvanced] = useState(false)

  // http
  const [url, setUrl] = useState(ic?.kind === 'http' ? ic.url : '')
  const [responsePath, setResponsePath] = useState(ic?.kind === 'http' ? (ic.response_path ?? 'reply') : 'reply')
  const [messagesField, setMessagesField] = useState(ic?.kind === 'http' ? (ic.messages_field ?? 'messages') : 'messages')
  const [headers, setHeaders] = useState(ic?.kind === 'http' && ic.headers && Object.keys(ic.headers).length ? JSON.stringify(ic.headers) : '')
  const [httpSendPrompt, setHttpSendPrompt] = useState(ic?.kind === 'http' ? (ic.send_system_prompt ?? false) : false)

  // fake
  const [behavior, setBehavior] = useState<'leaky' | 'compliant'>(ic?.kind === 'fake' ? ic.behavior : 'leaky')

  // evaluator (prefilled from server suggestions until the user types)
  const [evBase, setEvBase] = useState<string | null>(ie?.base_url ?? null)
  const [evModel, setEvModel] = useState<string | null>(ie?.model ?? null)
  const [evScenario, setEvScenario] = useState<string | null>(ie?.scenario_model ?? null)
  const [evKey, setEvKey] = useState('')
  const evBaseUrl = evBase ?? suggested?.base_url ?? 'https://openrouter.ai/api/v1'
  const evModelName = evModel ?? suggested?.model ?? ''
  const evScenarioModel = evScenario ?? suggested?.scenario_model ?? ''

  const [formError, setFormError] = useState<string | null>(null)
  const [test, setTest] = useState<ConnectionTestResult | null>(null)

  const savedTargetKey = ic?.kind === 'openai_chat' && ic.api_key === '***'
  const savedEvKey = ie?.api_key === '***'
  const needsEvaluator = kind !== 'fake'

  function build(): TargetCreate | string {
    if (!name.trim()) return 'Give the agent a name.'
    if (!systemPrompt.trim()) return 'Paste the system prompt your agent runs with.'
    let connection: TargetConnection
    if (kind === 'openai_chat') {
      if (!model.trim()) return 'Which model does your agent run on?'
      if (!apiKey && !savedTargetKey) return 'Paste the API key for your agent’s endpoint.'
      connection = {
        kind,
        base_url: baseUrl.trim(),
        model: model.trim(),
        api_key: apiKey || (savedTargetKey ? '***' : null),
        send_system_prompt: sendPrompt,
        max_tokens: Number(maxTokens) || 16384,
        temperature: temperature === '' ? null : Number(temperature),
      }
    } else if (kind === 'http') {
      if (!url.trim()) return 'Endpoint URL is required.'
      let parsed: Record<string, string> = {}
      if (headers.trim()) {
        try {
          parsed = JSON.parse(headers)
        } catch {
          return 'Headers must be a JSON object, e.g. {"Authorization": "Bearer …"}'
        }
      }
      connection = { kind, url: url.trim(), response_path: responsePath, messages_field: messagesField, headers: parsed, send_system_prompt: httpSendPrompt }
    } else {
      connection = { kind: 'fake', behavior }
    }
    let evaluator: EvaluatorConnection | null = null
    if (needsEvaluator) {
      if (!evModelName.trim()) return 'Pick the evaluator model.'
      if (!evKey && !savedEvKey) return 'Paste the API key for the evaluator model.'
      evaluator = {
        base_url: evBaseUrl.trim(),
        model: evModelName.trim(),
        scenario_model: evScenarioModel.trim() || null,
        api_key: evKey || '***',
      }
    }
    return { name: name.trim(), description: initial?.description ?? null, system_prompt: systemPrompt, connection, evaluator }
  }

  const save = useMutation({
    mutationFn: (body: TargetCreate) => (initial ? api.updateTarget(initial.id, body) : api.createTarget(body)),
    onSuccess: (target) => {
      qc.invalidateQueries({ queryKey: keys.targets })
      onSaved(target)
    },
    onError: (e: Error) => setFormError(e.message),
  })
  const probe = useMutation({
    mutationFn: (body: TargetCreate) => api.testConnection({ ...body, target_id: initial?.id ?? null }),
    onSuccess: setTest,
    onError: (e: Error) => setFormError(e.message),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const body = build()
    if (typeof body === 'string') return setFormError(body)
    save.mutate(body)
  }

  function runTest() {
    setFormError(null)
    setTest(null)
    const body = build()
    if (typeof body === 'string') return setFormError(body)
    probe.mutate(body)
  }

  function loadExample(key: string) {
    const ex = EXAMPLE_AGENTS.find((x) => x.key === key)
    if (!ex) return
    setName(ex.name)
    setSystemPrompt(ex.prompt)
  }

  const mono = 'font-mono text-[12.5px]'

  return (
    <form onSubmit={submit} className="flex flex-col">
      {/* 1. the agent under test */}
      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <SectionHead n={1} title="Your agent" sub="The agent you want to evaluate, and the system prompt it ships with. Every rule in the prompt becomes something we test." />
        {!initial && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] text-ink-3">Try an example prompt:</span>
            {EXAMPLE_AGENTS.map((ex) => (
              <button key={ex.key} type="button" onClick={() => loadExample(ex.key)}>
                <Chip tone="outline" className="cursor-pointer transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700">
                  {ex.label}
                </Chip>
              </button>
            ))}
          </div>
        )}
        <Field label="Name" htmlFor="a-name">
          <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Support bot" />
        </Field>
        <Field label="System prompt" htmlFor="a-prompt">
          <Textarea id="a-prompt" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={8} placeholder="You are …" className={mono} />
        </Field>

        <div className="flex flex-col gap-3">
          <span className="font-display text-[12.5px] font-medium text-ink-2">Where it runs</span>
          <Segmented
            id="kind"
            value={kind}
            onChange={setKind}
            className="w-full"
            options={[
              { value: 'openai_chat', label: <><Cloud className="hidden size-3.5 sm:block" /> OpenAI-compatible</> },
              { value: 'http', label: <><Globe className="hidden size-3.5 sm:block" /> Custom HTTP</> },
              { value: 'fake', label: <><FlaskConical className="hidden size-3.5 sm:block" /> <span className="sm:hidden">Demo</span><span className="hidden sm:inline">Offline demo</span></> },
            ]}
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={kind} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="flex flex-col gap-4">
              {kind === 'openai_chat' && (
                <>
                  <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr]">
                    <Field label="Base URL" htmlFor="a-base">
                      <Input id="a-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={mono} />
                    </Field>
                    <Field label="Model" htmlFor="a-model">
                      <Input id="a-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="z-ai/glm-5.3-flash" className={mono} />
                    </Field>
                  </div>
                  <Field label="API key" htmlFor="a-key" hint={<KeyHint saved={savedTargetKey} />}>
                    <Input
                      id="a-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className={mono}
                      placeholder={savedTargetKey ? '•••••••• saved' : 'sk-…'}
                      autoComplete="off"
                    />
                  </Field>
                  <button type="button" onClick={() => setAdvanced((a) => !a)} className="inline-flex w-fit items-center gap-1 text-[12.5px] font-medium text-ink-3 hover:text-ink">
                    <ChevronDown className={cn('size-3.5 transition-transform', advanced && 'rotate-180')} /> Advanced
                  </button>
                  <AnimatePresence initial={false}>
                    {advanced && (
                      <motion.div {...collapse} className="overflow-hidden">
                        <div className="flex flex-col gap-4 pt-1">
                          <Switch checked={sendPrompt} onChange={setSendPrompt} label="Send the system prompt with each request" hint="Turn off if your deployed agent applies its own prompt server-side." />
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Max tokens" hint="Reasoning models spend some before answering.">
                              <Input inputMode="numeric" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
                            </Field>
                            <Field label="Temperature" hint="Blank uses the provider default.">
                              <Input inputMode="decimal" value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder="default" />
                            </Field>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
              {kind === 'http' && (
                <>
                  <Field
                    label="Endpoint URL"
                    htmlFor="a-url"
                    hint={<>We POST <code className="font-mono text-[11.5px]">{`{"${messagesField || 'messages'}": [{role, content}, …]}`}</code> and read the reply at the response path.</>}
                  >
                    <Input id="a-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://agent.example.com/chat" className={mono} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Response path" hint="Dotted, e.g. choices.0.message.content">
                      <Input value={responsePath} onChange={(e) => setResponsePath(e.target.value)} className={mono} />
                    </Field>
                    <Field label="Messages field">
                      <Input value={messagesField} onChange={(e) => setMessagesField(e.target.value)} className={mono} />
                    </Field>
                  </div>
                  <Field label="Headers (JSON)" hint="Optional, e.g. your auth header.">
                    <Textarea rows={2} value={headers} onChange={(e) => setHeaders(e.target.value)} placeholder='{"Authorization": "Bearer …"}' className={mono} />
                  </Field>
                  <Switch checked={httpSendPrompt} onChange={setHttpSendPrompt} label="Prepend the system prompt" hint="Usually off: your backend applies its own." />
                </>
              )}
              {kind === 'fake' && (
                <div className="flex flex-col items-start justify-between gap-3 rounded-xl bg-n-50 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <p className="text-[13px] leading-relaxed text-ink-2">A scripted agent and scripted evaluators that run entirely offline. No keys, no cost: a quick way to see how Heckler works.</p>
                  <Segmented id="behavior" value={behavior} onChange={setBehavior} options={[{ value: 'leaky', label: 'Leaky' }, { value: 'compliant', label: 'Compliant' }]} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* 2. the evaluator */}
      <AnimatePresence initial={false}>
        {needsEvaluator && (
          <motion.div {...collapse} className="overflow-hidden">
            <div className="flex flex-col gap-5 border-t border-line bg-n-50/50 p-4 sm:p-6">
              <SectionHead
                n={2}
                title="Evaluator model"
                sub="Plays your users in every conversation, then grades each one. It also writes the scenarios. Runs on your own key, from any OpenAI-compatible endpoint."
              />
              <Field label="Base URL" htmlFor="e-base">
                <Input id="e-base" value={evBaseUrl} onChange={(e) => setEvBase(e.target.value)} className={mono} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Evaluator model" htmlFor="e-model" hint="Plays the users and grades. A strong model grades best.">
                  <Input id="e-model" value={evModelName} onChange={(e) => setEvModel(e.target.value)} placeholder="anthropic/claude-haiku-5.5" className={mono} />
                </Field>
                <Field label="Scenario model" htmlFor="e-scn" hint="Writes the scenarios with Simula. Fast and cheap is fine.">
                  <Input id="e-scn" value={evScenarioModel} onChange={(e) => setEvScenario(e.target.value)} placeholder="Same as evaluator" className={mono} />
                </Field>
              </div>
              <Field label="API key" htmlFor="e-key" hint={<KeyHint saved={savedEvKey} />}>
                <Input id="e-key" type="password" value={evKey} onChange={(e) => setEvKey(e.target.value)} className={mono} placeholder={savedEvKey ? '•••••••• saved' : 'sk-or-…'} autoComplete="off" />
              </Field>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* footer: test, then save */}
      <div className="flex flex-col gap-3 border-t border-line px-4 py-4 sm:px-6">
        <AnimatePresence initial={false}>
          {test && (
            <motion.div {...collapse} className="overflow-hidden">
              <div className="grid gap-2 sm:grid-cols-2">
                <ProbeLine label="Your agent" r={test.target} />
                {test.evaluator && <ProbeLine label="Evaluator" r={test.evaluator} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {formError && <p className="rounded-lg bg-fail-soft px-3 py-2 text-[12.5px] text-fail">{formError}</p>}
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="secondary" onClick={runTest} loading={probe.isPending}>
            {!probe.isPending && <Zap className="size-3.5" />}
            Test connection
          </Button>
          <Button type="submit" variant="ink" loading={save.isPending} className="group">
            {submitLabel ?? 'Continue'}
            {!save.isPending && <ArrowRight className="size-4 transition-transform duration-300 ease-out-soft group-hover:translate-x-0.5" />}
          </Button>
        </div>
      </div>
    </form>
  )
}
