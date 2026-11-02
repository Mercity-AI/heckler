import { Check, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/format'
import { SAMPLE_CHATS, type SampleChat } from './sampleRun'

const TICK = 100
const GRADING = 900
const HOLD = 7000

// the first message is already there at the start, so no window opens empty
const chatEnd = (c: SampleChat) => (c.messages.length - 1) * c.pace + c.pace / 2
const FINISH = Math.max(...SAMPLE_CHATS.map((c) => chatEnd(c) + GRADING))

function Typing({ right }: { right: boolean }) {
  return (
    <div className={cn('flex', right && 'justify-end')} aria-hidden>
      <span className={cn('flex gap-1 rounded-2xl px-3 py-2.5', right ? 'bg-[#efedff]' : 'bg-[#fff0e6]')}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1 animate-blink rounded-full bg-dusk-3" style={{ animationDelay: `${i * 0.16}s` }} />
        ))}
      </span>
    </div>
  )
}

function Bubble({ text, right, fault, turn }: { text: string; right: boolean; fault: boolean; turn: number }) {
  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={cn('flex flex-col', right ? 'items-end' : 'items-start')}>
      <p
        className={cn(
          'max-w-[92%] rounded-2xl px-3 py-2 text-[13.5px] leading-[1.4] text-pretty transition-colors duration-300',
          right ? 'rounded-br-md' : 'rounded-bl-md bg-[#fff0e6] text-dusk',
          right && (fault ? 'bg-[#ffe6e0] text-[#8f1c27] ring-1 ring-[#f0565c]' : 'bg-[#efedff] text-dusk'),
        )}
      >
        {text}
      </p>
      {fault && (
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1 font-display text-[12px] font-medium text-fail">
          Caught at turn {turn}
        </motion.span>
      )}
    </motion.div>
  )
}

function ChatWindow({ chat, t }: { chat: SampleChat; t: number }) {
  const shown = Math.min(chat.messages.length, 1 + Math.floor(t / chat.pace))
  const talking = shown < chat.messages.length
  const graded = t >= chatEnd(chat) + GRADING
  const failed = chat.faultAt !== undefined
  const log = useRef<HTMLDivElement>(null)

  // keeps the newest message in view; scrolls only this window, never the page
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [shown, graded])

  return (
    <div className="flex w-[84%] shrink-0 snap-center flex-col overflow-hidden rounded-2xl border border-dusk/8 bg-white sm:w-auto sm:min-w-0">
      <div className="flex items-center justify-between gap-2 border-b border-dusk/8 px-3.5 py-2.5">
        <span className="truncate font-display text-[13.5px] font-semibold text-dusk">{chat.name}</span>
        <span className="shrink-0 font-mono text-[11px] text-dusk-3">{chat.id}</span>
      </div>

      <div ref={log} className="flex h-[322px] flex-col gap-2 overflow-hidden p-3">
        {chat.messages.slice(0, shown).map((text, i) => (
          <Bubble key={i} text={text} right={i % 2 === 1} fault={graded && i === chat.faultAt} turn={Math.ceil((i + 1) / 2)} />
        ))}
        {talking && <Typing right={shown % 2 === 1} />}
      </div>

      <div className={cn('flex min-h-[78px] flex-col justify-center border-t px-3.5 py-2.5 transition-colors duration-300', !graded ? 'border-dusk/8' : failed ? 'border-[#ffc2b4] bg-[#fff4f0]' : 'border-teal-500/25 bg-teal-100/50')}>
        {graded ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <span className={cn('flex items-center gap-1.5 font-display text-[13.5px] font-semibold', failed ? 'text-fail' : 'text-teal-700')}>
              {failed ? <X className="size-3.5" /> : <Check className="size-3.5" />}
              {failed ? 'Failed' : 'Passed'} {chat.score}/100
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-dusk-2">
              {failed ? 'Broke' : 'Kept'}: “{chat.rule}”
            </span>
          </motion.div>
        ) : (
          <span className="font-mono text-[11.5px] text-dusk-3">{talking ? 'Chatting' : 'Grading'}</span>
        )}
      </div>
    </div>
  )
}

/**
 * The hero animation: a sample run of three simulated users chatting with one agent at the same time.
 * Each chat is graded when it ends, and a reply that broke a rule is marked. Loops while on screen.
 */
export function ParallelRun() {
  const reduced = useReducedMotion()
  const [clock, setClock] = useState(0)
  const [inView, setInView] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  const t = reduced ? FINISH : clock
  const running = !reduced && inView

  useEffect(() => {
    const el = root.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setClock((c) => (c >= FINISH + HOLD ? 0 : c + TICK)), TICK)
    return () => clearInterval(id)
  }, [running])

  return (
    <div ref={root} className="overflow-hidden rounded-[22px] border border-white/80 bg-white/70 shadow-[0_30px_80px_-24px_rgb(80_72_229/0.35),0_2px_8px_rgb(80_72_229/0.08)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1 sm:px-5">
        <span className="font-display text-[14px] font-semibold text-dusk">Atlas, travel booking agent</span>
        <span className="font-mono text-[11px] text-dusk-3">Sample run</span>
      </div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto p-3 [scrollbar-width:none] sm:grid sm:grid-cols-3 sm:overflow-visible sm:p-4">
        {SAMPLE_CHATS.map((c) => (
          <ChatWindow key={c.id} chat={c} t={t} />
        ))}
      </div>
    </div>
  )
}
