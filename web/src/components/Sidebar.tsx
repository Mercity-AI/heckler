import { Bot, PanelLeftClose, PanelLeftOpen, Plus, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { cn, isActive, relativeTime } from '../lib/format'
import { useHealth, useRuns, useTargets } from '../lib/queries'
import type { RunSummary } from '../lib/types'
import { StatusDot } from './status'
import { Eyebrow, Kbd, Skeleton, Tooltip } from './ui/primitives'

const EASE = [0.22, 1, 0.36, 1] as const
const OPEN_W = 264
const CLOSED_W = 60
const STORAGE_KEY = 'heckler.sidebar.collapsed'

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7 shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--color-ink)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--color-indigo-300)" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="4.5" fill="none" stroke="var(--color-indigo-300)" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="1.6" fill="#ef4d55" />
    </svg>
  )
}

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function runResult(run: RunSummary): { text: string; tone: 'fail' | 'pass' | 'live' | 'muted' } {
  if (isActive(run.status)) return { text: run.status === 'running' ? `Running ${run.finished}/${run.total}` : 'Mapping', tone: 'live' }
  if (run.status === 'failed') return { text: run.error ? `Failed: ${run.error}` : 'Failed', tone: 'fail' }
  if (!run.finished) return { text: run.status === 'cancelled' ? 'Cancelled' : 'No conversations', tone: 'muted' }
  const broke = run.break_rate != null ? Math.round(run.break_rate * run.finished) : 0
  return broke ? { text: `Breached ${broke}/${run.finished}`, tone: 'fail' } : { text: `Held ${run.finished}/${run.finished}`, tone: 'pass' }
}

/** Label that fades in/out with the sidebar instead of squashing. */
function Reveal({ show, children, className }: { show: boolean; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -4 }} transition={{ duration: 0.18, ease: EASE }} className={cn('min-w-0', className)}>
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

function RunRow({ run, active, collapsed }: { run: RunSummary; active: boolean; collapsed: boolean }) {
  const result = runResult(run)
  const row = (
    <Link to={`/runs/${run.id}`} className={cn('group relative block rounded-lg outline-none', collapsed ? 'mx-auto grid size-9 place-items-center' : 'px-2.5 py-2')}>
      {active && <motion.span layoutId="sidebar-active" className="absolute inset-0 rounded-lg border border-line bg-surface shadow-card" transition={{ type: 'spring', bounce: 0.12, duration: 0.4 }} />}
      {!active && <span className="absolute inset-0 rounded-lg transition-colors duration-200 group-hover:bg-n-100" />}
      {collapsed ? (
        // collapsed: one dot whose colour carries the outcome (details in the tooltip)
        result.tone === 'live' ? (
          <StatusDot status={run.status} className="relative" />
        ) : (
          <span className={cn('relative size-2 rounded-full', result.tone === 'fail' ? 'bg-fail' : result.tone === 'pass' ? 'bg-pass' : 'bg-n-300')} />
        )
      ) : (
        <>
          <div className="relative flex items-center gap-2">
            <StatusDot status={run.status} />
            <span className={cn('min-w-0 flex-1 truncate font-display text-[13px] font-medium', active ? 'text-ink' : 'text-ink-2')}>{run.target_name}</span>
            <span className="shrink-0 text-[11px] text-ink-3 tabular">{relativeTime(run.created_at)}</span>
          </div>
          <div className="relative mt-1 flex items-center gap-2 pl-4 text-[11.5px] text-ink-3">
            <span
              className={cn(
                'truncate tabular',
                result.tone === 'fail' && 'text-fail',
                result.tone === 'pass' && 'text-pass',
                result.tone === 'live' && 'shimmer-text font-medium',
                run.status === 'failed' && 'text-fail/80',
              )}
            >
              {result.text}
            </span>
            {run.status === 'completed' && run.mean_score != null && <span className="shrink-0 tabular">· score {Math.round(run.mean_score)}</span>}
          </div>
        </>
      )}
    </Link>
  )
  if (!collapsed) return row
  return (
    <Tooltip
      side="right"
      content={
        <span>
          <span className="font-medium">{run.target_name}</span> · {relativeTime(run.created_at)}
          <br />
          <span className="text-white/70">{result.text}</span>
        </span>
      }
    >
      {row}
    </Tooltip>
  )
}

export function Sidebar() {
  const runs = useRuns()
  const targets = useTargets()
  const health = useHealth()
  const location = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(readCollapsed)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  }, [collapsed])

  // "[" toggles the sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key !== '[' || e.metaKey || e.ctrlKey || el.closest('input,textarea,[contenteditable],[role=dialog]')) return
      e.preventDefault()
      setCollapsed((c) => !c)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = runs.data ?? []
    return q ? list.filter((r) => r.target_name.toLowerCase().includes(q) || r.id.includes(q)) : list
  }, [runs.data, query])

  const activeRunId = location.pathname.match(/^\/runs\/([^/]+)/)?.[1]
  const open = !collapsed

  const toggle = (
    <Tooltip content={<span>{open ? 'Collapse' : 'Expand'} sidebar <Kbd>[</Kbd></span>} side="right">
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-n-100 hover:text-ink"
      >
        {open ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
      </button>
    </Tooltip>
  )

  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? OPEN_W : CLOSED_W }}
      transition={{ duration: 0.35, ease: EASE }}
      className="flex h-full shrink-0 flex-col overflow-hidden border-r border-line bg-n-50/70"
    >
      <div className={cn('flex items-center gap-2.5 pt-4 pb-3', open ? 'px-4' : 'flex-col px-0')}>
        <Link to="/" aria-label="Heckler home">
          <Logo />
        </Link>
        <Reveal show={open} className="flex-1 leading-tight whitespace-nowrap">
          <div className="font-display text-[15px] font-semibold tracking-[-0.01em]">Heckler</div>
          <div className="font-mono text-[9.5px] tracking-[0.12em] text-ink-3 uppercase">by Mercity</div>
        </Reveal>
        {toggle}
      </div>

      <div className={cn(open ? 'px-3' : 'flex justify-center')}>
        <Tooltip content={open ? null : <span>New evaluation <Kbd>N</Kbd></span>} side="right">
          <button
            onClick={() => navigate('/')}
            className={cn(
              'group inline-flex h-9 items-center gap-2 rounded-[10px] bg-ink font-display text-[13.5px] font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(22_22_29/0.3)] transition-[background-color,transform] duration-200 hover:bg-n-800 active:scale-[0.98]',
              open ? 'w-full justify-between px-3.5' : 'w-9 justify-center',
            )}
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <Plus className="size-4 shrink-0 transition-transform duration-300 group-hover:rotate-90" />
              {open && 'New evaluation'}
            </span>
            {open && <span className="rounded bg-white/15 px-1 font-mono text-[10px] text-white/80">N</span>}
          </button>
        </Tooltip>
      </div>

      <nav className={cn('mt-3', open ? 'px-3' : 'flex justify-center')}>
        <Tooltip content={open ? null : 'Your agents'} side="right">
          <NavLink
            to="/agents"
            className={({ isActive: a }) =>
              cn(
                'flex h-8 items-center gap-2.5 rounded-lg font-display text-[13px] font-medium whitespace-nowrap transition-colors',
                open ? 'px-2.5' : 'w-9 justify-center',
                a ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-ink-2 hover:bg-n-100',
              )
            }
          >
            <Bot className="size-4 shrink-0 text-ink-3" />
            {open && (
              <>
                Your agents
                <span className="ml-auto font-mono text-[11px] text-ink-3 tabular">{targets.data?.length ?? ''}</span>
              </>
            )}
          </NavLink>
        </Tooltip>
      </nav>

      <div className={cn('mt-5 flex items-center', open ? 'justify-between px-5' : 'justify-center')}>
        {open ? (
          <>
            <Eyebrow>Runs</Eyebrow>
            <span className="font-mono text-[10.5px] text-ink-3 tabular">{runs.data?.length ?? ''}</span>
          </>
        ) : (
          <span className="h-px w-6 bg-line" />
        )}
      </div>
      {open && (runs.data?.length ?? 0) > 6 && (
        <div className="relative mx-3 mt-2">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter runs"
            className="h-8 w-full rounded-lg border border-transparent bg-n-100 pr-2 pl-8 text-[12.5px] outline-none transition-colors placeholder:text-ink-3 focus:border-line focus:bg-surface"
          />
        </div>
      )}

      <div className={cn('scrollbar-thin mt-2 min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-3', open ? 'px-2' : 'flex flex-col items-center gap-1 px-0')}>
        {runs.isPending ? (
          <div className="space-y-3 px-2.5 pt-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                {open && <Skeleton className="h-3 w-1/2" />}
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          open && <p className="px-3 pt-1 text-[12.5px] leading-relaxed text-ink-3">{query ? 'No runs match.' : 'Evaluations you start appear here, live.'}</p>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((run) => (
              <motion.div key={run.id} layout="position" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className={cn(!open && 'w-full')}>
                <RunRow run={run} active={run.id === activeRunId} collapsed={!open} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <div className={cn('flex items-center gap-2 border-t border-line py-3 text-[11.5px] whitespace-nowrap text-ink-3', open ? 'px-4' : 'justify-center')}>
        <Tooltip content={open ? null : health.isSuccess ? `Backend online · v${health.data.version}` : 'Backend offline'} side="right">
          <span className={cn('size-1.5 shrink-0 rounded-full', health.isSuccess ? 'bg-pass' : health.isError ? 'bg-fail' : 'bg-n-300')} />
        </Tooltip>
        {open && (health.isSuccess ? `Backend online · v${health.data.version}` : health.isError ? 'Backend offline' : 'Connecting…')}
      </div>
    </motion.aside>
  )
}
