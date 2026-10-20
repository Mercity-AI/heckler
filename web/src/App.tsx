import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { Link, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router'
import { Sidebar } from './components/Sidebar'
import { Card, EmptyState } from './components/ui/primitives'
import { AgentsPage } from './pages/Agents'
import { DesignPage } from './pages/Design'
import { HomePage } from './pages/Home'
import { RunsPage } from './pages/Runs'
import { RunViewPage } from './pages/RunView'

function Shell() {
  const location = useLocation()
  const navigate = useNavigate()

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
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="scrollbar-thin relative min-w-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={pageKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="min-h-full">
            <Outlet />
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
