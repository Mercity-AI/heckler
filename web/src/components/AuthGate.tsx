import { SignIn, useAuth } from '@clerk/react'
import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { clerkAppearance, setTokenGetter } from '../lib/auth'
import { LandingPage } from '../pages/Landing'
import { HecklerMark, HecklerWordmark, MercityLogoLink } from './brand'
import { Backdrop } from './visual/Backdrop'

function SignInPage() {
  return (
    <div className="relative isolate grid min-h-screen place-items-center overflow-hidden px-4 py-12">
      <Backdrop className="absolute inset-0 -z-10" />
      <MercityLogoLink className="absolute top-4 right-6" />
      <div className="flex flex-col items-center gap-6">
        <Link to="/" aria-label="Heckler home" className="flex items-center gap-3">
          <HecklerMark className="size-10" />
          <HecklerWordmark large />
        </Link>
        <SignIn routing="hash" withSignUp appearance={clerkAppearance} />
        <nav className="flex gap-4 text-[12.5px] text-ink-3">
          <Link to="/privacy" className="hover:text-ink">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-ink">Terms of Service</Link>
        </nav>
      </div>
    </div>
  )
}

// Readable without an account (Google's sign-in screen links to them).
const PUBLIC_PATHS = new Set(['/privacy', '/terms', '/about'])

// Remembers a session between visits, so someone signed in doesn't see the landing page flash at `/` while Clerk loads.
const SESSION_HINT = 'heckler.signed-in'

function hadSession() {
  try {
    return localStorage.getItem(SESSION_HINT) === '1'
  } catch {
    return false
  }
}

function rememberSession(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(SESSION_HINT, '1')
    else localStorage.removeItem(SESSION_HINT)
  } catch {
    /* storage unavailable: the landing page may just flash */
  }
}

/**
 * Shows the landing page at `/` and the sign-in screen everywhere else until there is a Clerk session,
 * and hands the session token to the API client. The landing page doesn't wait for Clerk to load.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()
  const queryClient = useQueryClient()
  const { pathname } = useLocation()

  // set during render, not in an effect, so the app's first queries already carry the token
  if (isLoaded) setTokenGetter(() => getToken())

  // signing out or switching accounts drops the previous user's cached agents and runs
  useEffect(() => {
    if (isLoaded) return () => queryClient.clear()
  }, [isLoaded, userId, queryClient])

  useEffect(() => {
    if (isLoaded) rememberSession(!!isSignedIn)
  }, [isLoaded, isSignedIn])

  if (PUBLIC_PATHS.has(pathname)) return <>{children}</>
  if (!isLoaded) return pathname === '/' && !hadSession() ? <LandingPage /> : null
  if (!isSignedIn) return pathname === '/' ? <LandingPage /> : <SignInPage />
  // remount per user so no page keeps another account's state around
  return <Fragment key={userId}>{children}</Fragment>
}
