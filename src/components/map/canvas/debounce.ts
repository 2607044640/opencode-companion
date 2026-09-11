export const POSITION_SAVE_MS = 1200

export function createDebounced<T>(delayMs: number, run: (value: T) => void): {
  readonly schedule: (value: T) => void
  readonly cancel: () => void
} {
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    schedule(value) {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => {
        timer = undefined
        run(value)
      }, delayMs)
    },
    cancel() {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
    },
  }
}
