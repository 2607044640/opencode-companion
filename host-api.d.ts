import type { IncomingMessage, ServerResponse } from 'node:http'

export function isSensitiveGitPath(filePath: string): boolean
export function resolveHostDirectory(rawDir: string | undefined): string | null
export function isAllowedExternalPath(filePath: string): boolean
export function parsePorcelainPaths(porcelain: string): string[]
export const MODEL_PROFILE_PATHS: string[]
export function resolveModelProfiles(customPath?: string | null): {
  ok: boolean
  path?: string
  version?: number
  default_model_id?: string
  aliases?: Record<string, string>
  profiles?: Record<string, any>
  error?: string
}
export function handleHostApi(req: IncomingMessage, res: ServerResponse): Promise<boolean>
