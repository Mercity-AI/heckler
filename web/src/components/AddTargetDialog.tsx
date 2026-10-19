import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Cloud, FlaskConical, Globe } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { EXAMPLE_AGENTS } from '../lib/examples'
import { cn } from '../lib/format'
import { keys } from '../lib/queries'
import type { Target, TargetConnection } from '../lib/types'
import { Button } from './ui/button'
import { Dialog } from './ui/overlay'
import { Chip, Field, Input, Segmented, Switch, Textarea } from './ui/primitives'

type Kind = TargetConnection['kind']

const collapse = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
}

export function AddTargetDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (t: Target) => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [kind, setKind] = useState<Kind>('openai_chat')

  // openai_chat
  const [baseUrl, setBaseUrl] = useState('https://openrouter.ai/api/v1')
  const [model, setModel] = useState('')
  const [keyMode, setKeyMode] = useState<'env' | 'inline'>('env')
  const [keyEnv, setKeyEnv] = useState('OPENROUTER_API_KEY')
  const [apiKey, setApiKey] = useState('')
  const [sendPrompt, setSendPrompt] = useState(true)
  const [maxTokens, setMaxTokens] = useState('2048')
  const [temperature, setTemperature] = useState('')
  const [advanced, setAdvanced] = useState(false)

  // http
  const [url, setUrl] = useState('')
  const [responsePath, setResponsePath] = useState('reply')
  const [messagesField, setMessagesField] = useState('messages')
  const [headers, setHeaders] = useState('')
  const [httpSendPrompt, setHttpSendPrompt] = useState(false)

  // fake
  const [behavior, setBehavior] = useState<'leaky' | 'compliant'>('leaky')

  const [formError, setFormError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: api.createTarget,
    onSuccess: (target) => {
      qc.invalidateQueries({ queryKey: keys.targets })
      onCreated?.(target)
      onOpenChange(false)
      reset()
    },
    onError: (e: Error) => setFormError(e.message),
  })

  function reset() {
    setName('')
    setDescription('')
    setSystemPrompt('')
    setModel('')
    setApiKey('')
    setUrl('')
    setHeaders('')
    setFormError(null)
  }

  function loadExample(key: string) {
    const ex = EXAMPLE_AGENTS.find((e) => e.key === key)
    if (!ex) return
    setName(ex.name)
    setDescription(ex.description)
    setSystemPrompt(ex.prompt)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    let connection: TargetConnection
    if (kind === 'openai_chat') {
      if (!model.trim()) return setFormError('Model is required.')
      connection = {
        kind,
        base_url: baseUrl.trim(),
        model: model.trim(),
        api_key_env: keyMode === 'env' && keyEnv.trim() ? keyEnv.trim() : null,
        api_key: keyMode === 'inline' && apiKey ? apiKey : null,
        send_system_prompt: sendPrompt,
        max_tokens: Number(maxTokens) || 2048,
        temperature: temperature === '' ? null : Number(temperature),
      }
    } else if (kind === 'http') {
      if (!url.trim()) return setFormError('Endpoint URL is required.')
      let parsedHeaders: Record<string, string> = {}
      if (headers.trim()) {
        try {
          parsedHeaders = JSON.parse(headers)
        } catch {
          return setFormError('Headers must be a JSON object, e.g. {"Authorization": "Bearer …"}')
        }
      }
      connection = { kind, url: url.trim(), response_path: responsePath, messages_field: messagesField, headers: parsedHeaders, send_system_prompt: httpSendPrompt }
    } else {
      connection = { kind: 'fake', behavior }
    }
    create.mutate({ name: name.trim(), description: description.trim() || null, system_prompt: systemPrompt, connection })
  }

  const canSubmit = name.trim() && systemPrompt.trim()

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Connect an agent"
      description="Point Heckler at your agent and paste its system prompt. Every rule in the prompt becomes something we test."
      className="max-w-[720px]"
      footer={
        <>
          {formError && <p className="mr-auto line-clamp-2 text-[12.5px] text-fail">{formError}</p>}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="ink" type="submit" form="add-target" disabled={!canSubmit} loading={create.isPending}>
            Connect agent
          </Button>
        </>
      }
    >
      <form id="add-target" onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-ink-3">Try an example:</span>
          {EXAMPLE_AGENTS.map((ex) => (
            <button key={ex.key} type="button" onClick={() => loadExample(ex.key)}>
              <Chip tone="outline" className="cursor-pointer transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700">
                {ex.label}
              </Chip>
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="t-name">
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Support bot (prod)" autoFocus />
          </Field>
          <Field label="Description" htmlFor="t-desc">
            <Input id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </Field>
        </div>

        <Field label="System prompt" htmlFor="t-prompt" hint="Scenarios are generated from this prompt, so use the one you ship.">
          <Textarea id="t-prompt" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={7} placeholder="You are …" className="font-mono text-[12.5px]" />
        </Field>

        <div className="flex flex-col gap-3">
          <span className="font-display text-[12.5px] font-medium text-ink-2">Where does it run?</span>
          <Segmented
            id="kind"
            value={kind}
            onChange={setKind}
            className="w-full"
            options={[
              { value: 'openai_chat', label: <><Cloud className="size-3.5" /> OpenAI-compatible</> },
              { value: 'http', label: <><Globe className="size-3.5" /> Custom HTTP</> },
              { value: 'fake', label: <><FlaskConical className="size-3.5" /> Offline demo</> },
            ]}
          />

          <div className="rounded-xl border border-line bg-n-50/60 p-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={kind} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="flex flex-col gap-4">
                {kind === 'openai_chat' && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
                      <Field label="Base URL" htmlFor="t-base">
                        <Input id="t-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="font-mono text-[12.5px]" />
                      </Field>
                      <Field label="Model" htmlFor="t-model">
                        <Input id="t-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="z-ai/glm-5.3-flash" className="font-mono text-[12.5px]" />
                      </Field>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="font-display text-[12.5px] font-medium text-ink-2">API key</span>
                        <Segmented id="keymode" value={keyMode} onChange={setKeyMode} options={[{ value: 'env', label: 'Server env var' }, { value: 'inline', label: 'Paste key' }]} />
                      </div>
                      {keyMode === 'env' ? (
                        <Input value={keyEnv} onChange={(e) => setKeyEnv(e.target.value)} className="font-mono text-[12.5px]" placeholder="OPENROUTER_API_KEY" aria-label="Environment variable name" />
                      ) : (
                        <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="font-mono text-[12.5px]" placeholder="sk-…" aria-label="API key" autoComplete="off" />
                      )}
                      <p className="text-[12px] text-ink-3">
                        {keyMode === 'env' ? 'Recommended. The key stays in the backend’s environment or .env.' : 'Stored by the backend and never sent back to the browser.'}
                      </p>
                    </div>
                    <Switch
                      checked={sendPrompt}
                      onChange={setSendPrompt}
                      label="Send the system prompt with each request"
                      hint="Turn off if your deployed agent already applies its own prompt server-side."
                    />
                    <button type="button" onClick={() => setAdvanced((a) => !a)} className="inline-flex w-fit items-center gap-1 text-[12.5px] font-medium text-ink-3 hover:text-ink">
                      <ChevronDown className={cn('size-3.5 transition-transform', advanced && 'rotate-180')} /> Advanced
                    </button>
                    <AnimatePresence initial={false}>
                      {advanced && (
                        <motion.div {...collapse} className="overflow-hidden">
                          <div className="grid gap-4 pt-1 sm:grid-cols-2">
                            <Field label="Max tokens" hint="Reasoning models spend some before answering.">
                              <Input inputMode="numeric" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
                            </Field>
                            <Field label="Temperature" hint="Blank uses the provider default.">
                              <Input inputMode="decimal" value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder="default" />
                            </Field>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
                {kind === 'http' && (
                  <>
                    <Field label="Endpoint URL" htmlFor="t-url" hint={<>We POST <code className="font-mono text-[11.5px]">{`{"${messagesField || 'messages'}": [{role, content}, …]}`}</code> and read the reply text at the response path.</>}>
                      <Input id="t-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://agent.example.com/chat" className="font-mono text-[12.5px]" />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Response path" hint="Dotted, e.g. choices.0.message.content">
                        <Input value={responsePath} onChange={(e) => setResponsePath(e.target.value)} className="font-mono text-[12.5px]" />
                      </Field>
                      <Field label="Messages field">
                        <Input value={messagesField} onChange={(e) => setMessagesField(e.target.value)} className="font-mono text-[12.5px]" />
                      </Field>
                    </div>
                    <Field label="Headers (JSON)" hint="Optional.">
                      <Textarea rows={2} value={headers} onChange={(e) => setHeaders(e.target.value)} placeholder='{"Authorization": "Bearer …"}' className="font-mono text-[12.5px]" />
                    </Field>
                    <Switch checked={httpSendPrompt} onChange={setHttpSendPrompt} label="Prepend the system prompt" hint="Usually off: your backend applies its own." />
                  </>
                )}
                {kind === 'fake' && (
                  <>
                    <p className="text-[13px] leading-relaxed text-ink-2">A scripted agent that runs entirely offline. Use it to see how Heckler works without spending tokens.</p>
                    <div className="flex items-center justify-between">
                      <span className="font-display text-[12.5px] font-medium text-ink-2">Behaviour</span>
                      <Segmented id="behavior" value={behavior} onChange={setBehavior} options={[{ value: 'leaky', label: 'Leaky' }, { value: 'compliant', label: 'Compliant' }]} />
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </form>
    </Dialog>
  )
}
