import { Bot, History, PanelLeftClose, PanelLeftOpen, Plus, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { cn, relativeTime } from '../lib/format'
import { useHealth, useRuns } from '../lib/queries'
import type { RunSummary } from '../lib/types'
import { MercityMark } from './brand'
import { runResult } from '../lib/outcome'
import { RunResultDot } from './status'
import { Kbd, Skeleton, Tooltip } from './ui/primitives'

const EASE = [0.22, 1, 0.36, 1] as const
const OPEN_W = 248
const CLOSED_W = 60
const STORAGE_KEY = 'heckler.sidebar.collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function RunRow({ run, active, collapsed }: { run: RunSummary; active: boolean; collapsed: boolean }) {
  const result = runResult(run)
  return (
    <Tooltip
      side="right"
      content={
        <span>
          <span className="font-medium">{run.target_name}</span>
          <br />
          <span className="text-white/70">
            {result.text} · {relativeTime(run.created_at)}
          </span>
        </span>
      }
    >
      <Link to={`/runs/${run.id}`} className={cn('group relative flex items-center rounded-lg outline-none', collapsed ? 'mx-auto size-9 justify-center' : 'h-8 gap-2.5 px-2.5')}>
        {active && <motion.span layoutId="sidebar-active" className="absolute inset-0 rounded-lg border border-line bg-surface shadow-card" transition={{ type: 'spring', bounce: 0.12, duration: 0.4 }} />}
        {!active && <span className="absolute inset-0 rounded-lg transition-colors duration-200 group-hover:bg-n-100" />}
        <span className="relative">
          <RunResultDot result={result} />
        </span>
        {!collapsed && (
          <>
            <span className={cn('relative min-w-0 flex-1 truncate text-[13px]', active ? 'font-medium text-ink' : 'text-ink-2')}>{run.target_name}</span>
            <span className="relative shrink-0 text-[11px] text-ink-3 tabular">{relativeTime(run.created_at).replace(' ago', '')}</span>
          </>
        )}
      </Link>
    </Tooltip>
  )
}

function NavItem({ to, label, icon, current, open }: { to: string; label: string; icon: ReactNode; current: boolean; open: boolean }) {
  return (
    <Tooltip content={open ? null : label} side="right">
      {/* a plain Link: the tooltip trigger merges classNames, which breaks NavLink's className function */}
      <Link
        to={to}
        aria-current={current ? 'page' : undefined}
        className={cn(
          'flex h-9 shrink-0 items-center rounded-[10px] font-display text-[13px] font-medium whitespace-nowrap transition-colors',
          open ? 'w-full gap-2.5 px-3.5' : 'w-9 justify-center',
          current ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-ink-2 hover:bg-n-100',
        )}
      >
        {icon}
        {open && label}
      </Link>
    </Tooltip>
  )
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

export function Sidebar() {
  const runs = useRuns()
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
      if (e.key !== '[' || e.metaKey || e.ctrlKey || el.closest('input,textarea,select,[contenteditable],[role=dialog]')) return
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

  const onAgents = location.pathname.startsWith('/agents')
  const onRuns = location.pathname === '/runs'
  const activeRunId = location.pathname.match(/^\/runs\/([^/]+)/)?.[1]
  const open = !collapsed

  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? OPEN_W : CLOSED_W }}
      transition={{ duration: 0.35, ease: EASE }}
      className="flex h-full shrink-0 flex-col overflow-hidden border-r border-line bg-n-50/70"
    >
      <div className={cn('flex items-center pt-4 pb-4', open ? 'gap-2.5 px-4' : 'flex-col gap-2 px-0')}>
        <Link to="/" aria-label="Heckler home" className={cn('flex min-w-0 items-center gap-2.5 text-[#1b2340]', open ? 'flex-1' : 'size-9 justify-center')}>
          <MercityMark className="size-8" />
          <Reveal show={open} className="leading-none whitespace-nowrap">
            <span className="block font-display text-[15px] font-semibold tracking-[-0.01em] text-ink">Heckler</span>
            <span className="mt-0.5 block font-serif text-[12px] text-ink-3 italic">by Mercity</span>
          </Reveal>
        </Link>
        <Tooltip content={<span>{open ? 'Collapse' : 'Expand'} sidebar <Kbd>[</Kbd></span>} side="right">
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
            className="grid size-9 shrink-0 place-items-center rounded-[10px] text-ink-3 transition-colors hover:bg-n-100 hover:text-ink"
          >
            {open ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          </button>
        </Tooltip>
      </div>

      <div className={cn('flex flex-col', open ? 'gap-1 px-3' : 'items-center gap-2')}>
        <Tooltip content={open ? null : <span>New evaluation <Kbd>N</Kbd></span>} side="right">
          <button
            onClick={() => navigate('/')}
            className={cn(
              'group inline-flex h-9 items-center gap-2 rounded-[10px] bg-ink font-display text-[13.5px] font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(22_22_29/0.3)] transition-[background-color,transform] duration-200 hover:bg-n-800 active:scale-[0.98]',
              open ? 'w-full px-3.5' : 'w-9 shrink-0 justify-center',
            )}
          >
            <Plus className="size-4 shrink-0 transition-transform duration-300 group-hover:rotate-90" />
            {open && 'New evaluation'}
          </button>
        </Tooltip>
        <NavItem to="/agents" label="Agents" icon={<Bot className="size-[17px] shrink-0 text-ink-2" />} current={onAgents} open={open} />
        <NavItem to="/runs" label="All runs" icon={<History className="size-[17px] shrink-0 text-ink-2" />} current={onRuns} open={open} />
      </div>

      <div className={cn('mt-6 mb-1', open ? 'px-5' : 'flex justify-center')}>
        {open ? <span className="font-display text-[12px] font-medium text-ink-3">Recent</span> : <span className="h-px w-6 bg-line" />}
      </div>
      {open && (runs.data?.length ?? 0) > 8 && (
        <div className="relative mx-3 mt-1 mb-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter runs"
            className="h-8 w-full rounded-lg border border-transparent bg-n-100 pr-2 pl-8 text-[12.5px] outline-none transition-colors placeholder:text-ink-3 focus:border-line focus:bg-surface"
          />
        </div>
      )}

      <div className={cn('scrollbar-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-3', open ? 'px-2' : 'flex flex-col items-center gap-1 px-0')}>
        {runs.isPending ? (
          <div className="space-y-3 px-2.5 pt-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-3.5 w-3/4" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          open && <p className="px-3 pt-1 text-[12.5px] leading-relaxed text-ink-3">{query ? 'No runs match.' : 'Evaluations you start appear here.'}</p>
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

      {health.isError && (
        <div className={cn('flex items-center gap-2 border-t border-line py-3 text-[11.5px] whitespace-nowrap text-fail', open ? 'px-4' : 'justify-center')}>
          <span className="size-1.5 shrink-0 rounded-full bg-fail" />
          {open && 'Backend offline'}
        </div>
      )}
    </motion.aside>
  )
}
