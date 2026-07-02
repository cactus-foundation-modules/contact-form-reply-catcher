// Outlook OAuth (site owner registers their own Azure app — no CASA-style gate
// for this offline_access + IMAP.AccessAsUser.All scope combination).

const AUTHORIZE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const SCOPE = 'offline_access https://outlook.office.com/IMAP.AccessAsUser.All'

export function buildMicrosoftAuthUrl(opts: { clientId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    response_type: 'code',
    redirect_uri: opts.redirectUri,
    response_mode: 'query',
    scope: SCOPE,
    state: opts.state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export type MicrosoftTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: Date
}

async function requestToken(body: URLSearchParams): Promise<MicrosoftTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Microsoft OAuth token request failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

export async function exchangeMicrosoftCode(opts: {
  clientId: string
  clientSecret: string
  redirectUri: string
  code: string
}): Promise<MicrosoftTokens> {
  return requestToken(
    new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: 'authorization_code',
      code: opts.code,
      scope: SCOPE,
    })
  )
}

export async function refreshMicrosoftToken(opts: {
  clientId: string
  clientSecret: string
  refreshToken: string
}): Promise<MicrosoftTokens> {
  return requestToken(
    new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
      grant_type: 'refresh_token',
      scope: SCOPE,
    })
  )
}
