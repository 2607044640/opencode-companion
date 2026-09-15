import type { IncomingMessage, ServerResponse } from 'node:http'

export function isSensitiveGitPath(filePath: string): boolean
export function resolveHostDirectory(rawDir: string | undefined): string | null
export function isAllowedExternalPath(filePath: string): boolean
export function parsePorcelainPaths(porcelain: string): string[]
export function handleHostApi(req: IncomingMessage, res: ServerResponse): Promise<boolean>
