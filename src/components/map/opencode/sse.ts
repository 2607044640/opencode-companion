import { z } from "zod"
import type { ListedSession } from "./client"
import { OPENCODE_BASE_URL } from "./client"

export const CHOSEN_SSE_PATH = "/event" as const

const SessionInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  directory: z.string(),
  time: z.object({
    updated: z.number(),
  }),
})

const CreatedSchema = z.object({
  type: z.literal("session.created"),
  properties: z.object({
    sessionID: z.string(),
    info: SessionInfoSchema,
  }),
})

const DeletedSchema = z.object({
  type: z.literal("session.deleted"),
  properties: z.object({
    sessionID: z.string(),
  }),
})

const StatusSchema = z.object({
  type: z.literal("session.status"),
  properties: z.object({
    sessionID: z.string(),
    status: z.object({
      type: z.union([z.literal("idle"), z.literal("busy"), z.literal("retry")]),
    }),
  }),
})

export type ParsedSseEvent =
  | { readonly kind: "created"; readonly session: ListedSession }
  | { readonly kind: "deleted"; readonly sessionId: string }
  | { readonly kind: "status"; readonly sessionId: string; readonly running: boolean }
  | { readonly kind: "ignored" }

export function parseSseEvent(payload: unknown): ParsedSseEvent {
  const created = CreatedSchema.safeParse(payload)
  if (created.success) {
    const info = created.data.properties.info
    return {
      kind: "created",
      session: {
        id: info.id,
        title: info.title,
        directory: info.directory,
        timeUpdated: info.time.updated,
      },
    }
  }
  const deleted = DeletedSchema.safeParse(payload)
  if (deleted.success) {
    return { kind: "deleted", sessionId: deleted.data.properties.sessionID }
  }
  const status = StatusSchema.safeParse(payload)
  if (status.success) {
    const type = status.data.properties.status.type
    return {
      kind: "status",
      sessionId: status.data.properties.sessionID,
      running: type === "busy" || type === "retry",
    }
  }
  return { kind: "ignored" }
}

export type SubscribeEventsInput = {
  readonly directory: string
  readonly onEvent: (event: ParsedSseEvent) => void
  readonly signal: AbortSignal
  readonly fetchImpl?: typeof fetch
  readonly baseUrl?: string
}

function eventUrl(baseUrl: string, directory: string): string {
  const url = new URL(CHOSEN_SSE_PATH, `${baseUrl}/`)
  url.searchParams.set("directory", directory)
  return url.toString()
}

function consumeSseBuffer(
  buffer: string,
  onEvent: (event: ParsedSseEvent) => void,
): string {
  const parts = buffer.split("\n\n")
  const rest = parts.pop()
  for (const block of parts) {
    const dataLines: string[] = []
    for (const line of block.split("\n")) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim())
      }
    }
    if (dataLines.length === 0) {
      continue
    }
    try {
      onEvent(parseSseEvent(JSON.parse(dataLines.join("\n")) as unknown))
    } catch (error) {
      if (error instanceof SyntaxError) {
        continue
      }
      throw error
    }
  }
  return rest ?? ""
}

export async function subscribeOpenCodeEvents(input: SubscribeEventsInput): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch
  const baseUrl = input.baseUrl ?? OPENCODE_BASE_URL
  const response = await fetchImpl(eventUrl(baseUrl, input.directory), {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
      "x-opencode-directory": input.directory,
    },
    signal: input.signal,
  })
  if (response.body === null) {
    return
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (!input.signal.aborted) {
    const chunk = await reader.read()
    if (chunk.done) {
      break
    }
    buffer = consumeSseBuffer(buffer + decoder.decode(chunk.value, { stream: true }), input.onEvent)
  }
}
