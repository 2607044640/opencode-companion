import { OPENCODE_BASE_URL } from "./client"

function unpaddedStdB64(value: string): string {
  return btoa(value).replace(/=+$/u, "")
}

export function sessionUrl(sessionId: string): string {
  return `${OPENCODE_BASE_URL}/server/${unpaddedStdB64(OPENCODE_BASE_URL)}/session/${sessionId}`
}
