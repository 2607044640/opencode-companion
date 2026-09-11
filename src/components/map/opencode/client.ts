import { createOpencodeClient as createSdkClient } from "@opencode-ai/sdk/v2/client"
import type { Project, Session, SessionStatus } from "@opencode-ai/sdk/v2/client"

export const OPENCODE_BASE_URL = "http://127.0.0.1:5001" as const
export const UNREACHABLE_BANNER = "OpenCode not reachable at 127.0.0.1:5001" as const

export class OpenCodeUnreachableError extends Error {
  readonly name = "OpenCodeUnreachableError"

  constructor() {
    super(UNREACHABLE_BANNER)
  }
}

export type ListedProject = {
  readonly id: string
  readonly worktree: string
  readonly name?: string
}

export class OpenCodeHttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`opencode request failed with status ${status}`)
    this.status = status
  }
}

export type ListedSession = {
  readonly id: string
  readonly title: string
  readonly directory: string
  readonly timeUpdated: number
  readonly parentID?: string
}

export type SessionRunState = "idle" | "busy" | "retry"

export type TalkMapClient = {
  readonly listProjects: () => Promise<readonly ListedProject[]>
  readonly listSessions: (directory: string) => Promise<readonly ListedSession[]>
  readonly listStatus: (directory: string) => Promise<Readonly<Record<string, SessionRunState>>>
  readonly createSession: (
    directory: string,
    options?: { readonly parentID?: string; readonly title?: string },
  ) => Promise<ListedSession>
  readonly updateSession: (input: {
    readonly sessionID: string
    readonly directory: string
    readonly title: string
  }) => Promise<ListedSession>
  readonly promptNoReply: (input: {
    readonly sessionID: string
    readonly directory: string
    readonly text: string
  }) => Promise<void>
  readonly promptJson: (input: {
    readonly sessionID: string
    readonly directory: string
    readonly text: string
  }) => Promise<unknown>
  readonly deleteSession: (input: {
    readonly sessionID: string
    readonly directory: string
  }) => Promise<void>
  readonly listMessages: (input: {
    readonly sessionID: string
    readonly directory: string
  }) => Promise<readonly string[]>
}

type SdkFields<T> = {
  readonly data: T | undefined
  readonly error: unknown
}

function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError
}

function unwrap<T>(result: SdkFields<T>): T {
  if (result.error !== undefined) {
    if (isNetworkFailure(result.error)) {
      throw new OpenCodeUnreachableError()
    }
    const status = extractErrorStatus(result.error)
    if (status !== undefined) {
      throw new OpenCodeHttpError(status)
    }
    throw result.error instanceof Error
      ? result.error
      : new Error("opencode request failed")
  }
  if (result.data === undefined) {
    throw new OpenCodeUnreachableError()
  }
  return result.data
}

function extractErrorStatus(error: unknown): number | undefined {
  if (error === null || typeof error !== "object") {
    return undefined
  }
  if ("status" in error) {
    const status = (error as { status?: unknown }).status
    if (typeof status === "number") {
      return status
    }
  }
  if ("response" in error) {
    const response = (error as { response?: { status?: unknown } }).response
    const status = response?.status
    if (typeof status === "number") {
      return status
    }
  }
  return undefined
}

function toListedProject(project: Project): ListedProject {
  if (project.name === undefined) {
    return { id: project.id, worktree: project.worktree }
  }
  return { id: project.id, worktree: project.worktree, name: project.name }
}

function toListedSession(session: Session): ListedSession {
  return {
    id: session.id,
    title: session.title,
    directory: session.directory,
    timeUpdated: session.time.updated,
    ...(session.parentID === undefined ? {} : { parentID: session.parentID }),
  }
}

function toRunState(status: SessionStatus): SessionRunState {
  switch (status.type) {
    case "busy":
      return "busy"
    case "retry":
      return "retry"
    case "idle":
      return "idle"
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof OpenCodeUnreachableError) {
      throw error
    }
    if (isNetworkFailure(error)) {
      throw new OpenCodeUnreachableError()
    }
    throw error
  }
}

export function createOpencodeClient(config: {
  readonly baseUrl: string
  readonly directory?: string
}): TalkMapClient {
  const sdk = createSdkClient({
    baseUrl: config.baseUrl,
    ...(config.directory === undefined ? {} : { directory: config.directory }),
  })

  return {
    listProjects: () =>
      guarded(async () => {
        const result = await sdk.project.list(
          config.directory === undefined ? {} : { directory: config.directory },
        )
        return unwrap(result).map(toListedProject)
      }),
    listSessions: (directory) =>
      guarded(async () => {
        const result = await sdk.session.list({ directory, scope: "project" })
        return unwrap(result).map(toListedSession)
      }),
    listStatus: (directory) =>
      guarded(async () => {
        const result = await sdk.session.status({ directory })
        const data = unwrap(result)
        const running: Record<string, SessionRunState> = {}
        for (const [sessionId, status] of Object.entries(data)) {
          running[sessionId] = toRunState(status)
        }
        return running
      }),
    createSession: (directory, options) =>
      guarded(async () => {
        const result = await sdk.session.create({
          directory,
          title: options?.title ?? "Untitled",
          ...(options?.parentID === undefined ? {} : { parentID: options.parentID }),
        })
        return toListedSession(unwrap(result))
      }),
    updateSession: (input) =>
      guarded(async () => {
        const result = await sdk.session.update({
          sessionID: input.sessionID,
          directory: input.directory,
          title: input.title,
        })
        return toListedSession(unwrap(result))
      }),
    promptNoReply: (input) =>
      guarded(async () => {
        unwrap(
          await sdk.session.prompt({
            sessionID: input.sessionID,
            directory: input.directory,
            noReply: true,
            parts: [{ type: "text", text: input.text }],
          }),
        )
      }),
    promptJson: (input) =>
      guarded(async () => {
        const result = await sdk.session.prompt({
          sessionID: input.sessionID,
          directory: input.directory,
          format: {
            type: "json_schema",
            retryCount: 2,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["summary", "keyFindings", "nextStep"],
              properties: {
                summary: { type: "string" },
                keyFindings: { type: "array", items: { type: "string" } },
                nextStep: { type: "string" },
              },
            },
          },
          parts: [{ type: "text", text: input.text }],
        })
        return unwrap(result)
      }),
    deleteSession: (input) =>
      guarded(async () => {
        unwrap(await sdk.session.delete({ sessionID: input.sessionID, directory: input.directory }))
      }),
    listMessages: (input) =>
      guarded(async () => {
        const result = unwrap(
          await sdk.session.messages({ sessionID: input.sessionID, directory: input.directory, limit: 20 }),
        )
        const texts: string[] = []
        for (const item of result) {
          const parts = "parts" in item ? item.parts : []
          if (!Array.isArray(parts)) {
            continue
          }
          for (const part of parts) {
            if (part !== null && typeof part === "object" && "text" in part && typeof part.text === "string") {
              texts.push(part.text)
            }
          }
        }
        return texts
      }),
  }
}

export function createLiveClient(directory: string): TalkMapClient {
  return createOpencodeClient({
    baseUrl: OPENCODE_BASE_URL,
    directory,
  })
}
