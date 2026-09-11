import type { ListedSession } from "../opencode/client"
import { OpenCodeHttpError } from "../opencode/client"

export type CommitTitleInput = {
  readonly ghost: boolean
  readonly sessionId: string
  readonly directory: string
  readonly title: string
  readonly updateSession: (input: {
    readonly sessionID: string
    readonly directory: string
    readonly title: string
  }) => Promise<ListedSession>
}

export type CommitTitleResult =
  | { readonly kind: "live"; readonly title: string }
  | { readonly kind: "ghost"; readonly title: string }
  | { readonly kind: "failed"; readonly status: number }

export async function commitTitle(input: CommitTitleInput): Promise<CommitTitleResult> {
  if (input.ghost) {
    return { kind: "ghost", title: input.title }
  }
  try {
    const updated = await input.updateSession({
      sessionID: input.sessionId,
      directory: input.directory,
      title: input.title,
    })
    return { kind: "live", title: updated.title }
  } catch (error) {
    if (error instanceof OpenCodeHttpError) {
      return { kind: "failed", status: error.status }
    }
    throw error
  }
}
