export function createSnapshotStore(options?: {
  root?: string
  resolvePath?: (file: string) => string | null
  allowedRoots?: string[]
  safeDelete?: (file: string) => void
}): {
  capture(session: string, call: string, paths: string[]): void
  finish(session: string, call: string): { version: number; session: string; call: string; paths: string[] }
  restore(session: string, calls: string[]): { ok: boolean; applied: string[] }
}
