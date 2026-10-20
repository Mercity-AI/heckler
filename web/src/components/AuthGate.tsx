import { SignIn, useAuth } from '@clerk/react'
import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, type ReactNode } from 'react'
import { clerkAppearance, setTokenGetter } from '../lib/auth'
import { HecklerMark, HecklerWordmark, MercityLogoLink } from './brand'
import { Backdrop } from './visual/Backdrop'

function SignInPage() {
  return (
    <div className="relative isolate grid min-h-screen place-items-center overflow-hidden px-4 py-12">
      <Backdrop className="absolute inset-0 -z-10" />
      <MercityLogoLink className="absolute top-4 right-6" />
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <HecklerMark className="size-10" />
          <HecklerWordmark large />
        </div>
        <SignIn routing="hash" withSignUp appearance={clerkAppearance} />
      </div>
    </div>
  )
}

/** Shows the sign-in screen until there is a Clerk session, and hands the session token to the API client. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()
  const queryClient = useQueryClient()

  // set during render, not in an effect, so the app's first queries already carry the token
  if (isLoaded) setTokenGetter(() => getToken())

  // signing out or switching accounts drops the previous user's cached agents and runs
  useEffect(() => {
    if (isLoaded) return () => queryClient.clear()
  }, [isLoaded, userId, queryClient])

  if (!isLoaded) return null
  if (!isSignedIn) return <SignInPage />
  // remount per user so no page keeps another account's state around
  return <Fragment key={userId}>{children}</Fragment>
}
