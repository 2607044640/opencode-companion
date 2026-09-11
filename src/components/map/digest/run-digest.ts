import { INJECT_BANNER, type DigestFields } from "../inject/spawn"
import type { TalkMap } from "../schema/talk-map"

export const DIGEST_INSTRUCTIONS =
  "Return JSON only with keys summary, keyFindings (string array), nextStep. No tools." as const

export type DigestClient = {
  readonly createSession: (
    directory: string,
    options?: { readonly title?: string },
  ) => Promise<{ readonly id: string }>
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

const inflight = new Set<string>()

export function hashTexts(texts: readonly string[]): string {
  let acc = 0
  const joined = texts.filter((text) => !text.startsWith(INJECT_BANNER)).join("\n")
  for (let i = 0; i < joined.length; i += 1) {
    acc = (acc * 31 + joined.charCodeAt(i)) >>> 0
  }
  return acc.toString(16)
}

function parseDigest(payload: unknown): DigestFields | undefined {
  if (payload !== null && typeof payload === "object") {
    const nested = payload as Record<string, unknown>
    const summary = nested["summary"]
    const keyFindings = nested["keyFindings"]
    const nextStep = nested["nextStep"]
    if (typeof summary === "string" && Array.isArray(keyFindings) && typeof nextStep === "string") {
      return {
        summary,
        keyFindings: keyFindings.filter((item): item is string => typeof item === "string"),
        nextStep,
      }
    }
    const text = nested["text"]
    return parseFenced(typeof text === "string" ? text : JSON.stringify(payload))
  }
  if (typeof payload === "string") {
    return parseFenced(payload)
  }
  return undefined
}

function parseFenced(text: string): DigestFields | undefined {
  const match = text.match(/\{[\s\S]*\}/)
  if (match === null) {
    return undefined
  }
  try {
    const parsed = JSON.parse(match[0]) as unknown
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "summary" in parsed &&
      "keyFindings" in parsed &&
      "nextStep" in parsed
    ) {
      const record = parsed as {
        summary: unknown
        keyFindings: unknown
        nextStep: unknown
      }
      if (
        typeof record.summary === "string" &&
        Array.isArray(record.keyFindings) &&
        typeof record.nextStep === "string"
      ) {
        return {
          summary: record.summary,
          keyFindings: record.keyFindings.filter((item): item is string => typeof item === "string"),
          nextStep: record.nextStep,
        }
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

export async function runDigest(input: {
  readonly client: DigestClient
  readonly map: TalkMap
  readonly directory: string
  readonly sessionId: string
  readonly title: string
}): Promise<TalkMap> {
  if (inflight.has(input.sessionId)) {
    return input.map
  }
  inflight.add(input.sessionId)
  try {
    const texts = await input.client.listMessages({
      sessionID: input.sessionId,
      directory: input.directory,
    })
    const inputHash = hashTexts(texts)
    const existing = input.map.digests[input.sessionId]
    if (existing?.inputHash === inputHash) {
      return input.map
    }
    const throwaway = await input.client.createSession(input.directory, {
      title: `[talk-map digest] ${input.title}`,
    })
    const raw = await input.client.promptJson({
      sessionID: throwaway.id,
      directory: input.directory,
      text: `${DIGEST_INSTRUCTIONS}\n${texts.slice(-8).join("\n")}`,
    })
    const digest = parseDigest(raw)
    try {
      await input.client.deleteSession({ sessionID: throwaway.id, directory: input.directory })
    } catch {
      // Keep the throwaway titled [talk-map digest]; never map a card for it.
    }
    if (digest === undefined) {
      return input.map
    }
    return {
      ...input.map,
      digests: {
        ...input.map.digests,
        [input.sessionId]: {
          summary: digest.summary,
          keyFindings: [...digest.keyFindings],
          nextStep: digest.nextStep,
          inputHash,
          updatedAt: Date.now(),
        },
      },
    }
  } finally {
    inflight.delete(input.sessionId)
  }
}
