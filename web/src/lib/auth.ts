/** Clerk is on when a publishable key is configured; without one the app runs as a single local user. */
export const CLERK_KEY: string | undefined = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || undefined

/** Clerk's components, dressed in the app's own type and colours. */
export const clerkAppearance = {
  variables: {
    colorPrimary: '#16161d',
    colorForeground: '#16161d',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    borderRadius: '10px',
  },
}

type TokenGetter = () => Promise<string | null>

let getToken: TokenGetter = async () => null

/** Set once Clerk has loaded, so plain `fetch` calls outside React can attach the session token. */
export function setTokenGetter(fn: TokenGetter) {
  getToken = fn
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}
