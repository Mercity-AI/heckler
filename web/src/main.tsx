import { ClerkProvider } from '@clerk/react'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import { AuthGate } from './components/AuthGate'
import { CLERK_KEY, clerkAppearance } from './lib/auth'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5_000 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <RadixTooltip.Provider delayDuration={250} skipDelayDuration={100}>
          <BrowserRouter>
            {CLERK_KEY ? (
              <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/" appearance={clerkAppearance}>
                <AuthGate>
                  <App />
                </AuthGate>
              </ClerkProvider>
            ) : (
              <App />
            )}
          </BrowserRouter>
        </RadixTooltip.Provider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
)
