import { sessionUrl } from "../opencode/deep-link"

export type OpenSessionInput = {
  readonly sessionId: string
  readonly openWindow: (url: string) => Window | null
  readonly copyText: (text: string) => Promise<void>
}

export type OpenSessionResult =
  | { readonly kind: "opened" }
  | { readonly kind: "copied"; readonly url: string }

export async function openSessionDeepLink(
  input: OpenSessionInput,
): Promise<OpenSessionResult> {
  const url = sessionUrl(input.sessionId)
  const opened = input.openWindow(url)
  if (opened !== null) {
    return { kind: "opened" }
  }
  try {
    await input.copyText(url)
  } catch (error) {
    if (error instanceof Error) {
      return { kind: "copied", url }
    }
    throw error
  }
  return { kind: "copied", url }
}
