import { DAEMON_LOOPBACK_URL } from "../../../services/api"

function unpaddedStdB64(value: string): string {
  return btoa(value).replace(/=+$/u, "")
}

export function sessionUrl(sessionId: string): string {
  return `${DAEMON_LOOPBACK_URL}/server/${unpaddedStdB64(DAEMON_LOOPBACK_URL)}/session/${sessionId}`
}
