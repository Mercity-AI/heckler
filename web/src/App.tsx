import { Menu } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate, useOutlet } from 'react-router'
import { Sidebar } from './components/Sidebar'
import { HecklerMark, HecklerWordmark, MercityLogoLink } from './components/brand'
import { Drawer } from './components/ui/overlay'
import { Card, EmptyState } from './components/ui/primitives'
import { AgentsPage } from './pages/Agents'
import { DesignPage } from './pages/Design'
import { HomePage } from './pages/Home'
import { PrivacyPage, TermsPage } from './pages/Legal'
import { RunsPage } from './pages/Runs'
import { RunViewPage } from './pages/RunView'

/** Phone-width header: opens the nav drawer, and carries the brand the hidden sidebar would. */
function MobileBar({ onMenu }: { onMenu: () => void }) {
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-ground/85 px-3 backdrop-blur md:hidden">
      <button onClick={onMenu} aria-label="Open menu" className="grid size-10 shrink-0 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-n-100 hover:text-ink">
        <Menu className="size-5" />
      </button>
      <Link to="/" aria-label="Heckler home" className="flex min-w-0 items-center gap-2">
        <HecklerMark className="size-7" />
        <HecklerWordmark />
      </Link>
      <MercityLogoLink className="ml-auto [&_img]:h-6" />
    </div>
  )
}

function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  // the outlet as of this render: the page fading out keeps its own content instead of mounting the next page too
  const outlet = useOutlet()
  // the drawer belongs to the page it was opened on, so picking somewhere to go closes it
  const [navOpenOn, setNavOpenOn] = useState<string | null>(null)
  const navOpen = navOpenOn === location.pathname

  // "N" starts a new evaluation from anywhere (outside text fields and dialogs)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input,textarea,select,[contenteditable],[role=dialog]')) return
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        navigate('/')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  // one transition key per page, not per query-string change
  const pageKey = location.pathname

  return (
    <div className="flex h-dvh overflow-hidden">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <Drawer open={navOpen} onOpenChange={(o) => setNavOpenOn(o ? location.pathname : null)} title="Navigation">
        <Sidebar drawer onClose={() => setNavOpenOn(null)} />
      </Drawer>
      <main className="scrollbar-thin relative min-w-0 flex-1 overflow-y-auto">
        <MobileBar onMenu={() => setNavOpenOn(location.pathname)} />
        {/* its own row on narrower screens; floats in the empty top-right corner once pages leave room for it */}
        <div className="hidden justify-end md:flex px-6 pt-4 min-[1400px]:absolute min-[1400px]:top-4 min-[1400px]:right-6 min-[1400px]:z-10 min-[1400px]:p-0">
          <MercityLogoLink />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={pageKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="min-h-full">
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

function NotFound() {
  return (
    <div className="mx-auto max-w-[560px] px-8 pt-24">
      <Card>
        <EmptyState
          title="Nothing here"
          action={
            <Link to="/" className="font-medium text-indigo-600 hover:underline">
              Start a new evaluation →
            </Link>
          }
        />
      </Card>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="privacy" element={<PrivacyPage />} />
      <Route path="terms" element={<TermsPage />} />
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="evaluate/:targetId" element={<DesignPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="runs" element={<RunsPage />} />
        <Route path="runs/:runId" element={<RunViewPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
