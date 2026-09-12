/**
 * Session Navigation History Stack (Back / Forward ← →)
 */

export class SessionHistoryStack {
  private stack: string[] = []
  private cursor: number = -1
  private maxHistory: number

  constructor(maxHistory = 50, initialSessionId?: string | null) {
    this.maxHistory = maxHistory
    if (initialSessionId && initialSessionId.trim()) {
      this.stack = [initialSessionId]
      this.cursor = 0
    }
  }

  /**
   * Pushes a newly selected or created session ID onto the stack.
   * If the user is currently at an earlier point in the history and navigates to a new session,
   * any forward history is pruned.
   */
  push(sessionId: string | null | undefined): void {
    if (!sessionId || !sessionId.trim()) return

    // If currently pointing to the same session, no-op
    if (this.cursor >= 0 && this.stack[this.cursor] === sessionId) {
      return
    }

    // Prune forward history if we navigated back and then selected a new session
    const nextStack = this.stack.slice(0, this.cursor + 1)
    nextStack.push(sessionId)

    // Bound history length
    if (nextStack.length > this.maxHistory) {
      nextStack.shift()
    }

    this.stack = nextStack
    this.cursor = this.stack.length - 1
  }

  get canGoBack(): boolean {
    return this.cursor > 0
  }

  get canGoForward(): boolean {
    return this.cursor >= 0 && this.cursor < this.stack.length - 1
  }

  /**
   * Moves back one step in history and returns the session ID
   */
  back(): string | null {
    if (!this.canGoBack) return null
    this.cursor -= 1
    return this.stack[this.cursor] ?? null
  }

  /**
   * Moves forward one step in history and returns the session ID
   */
  forward(): string | null {
    if (!this.canGoForward) return null
    this.cursor += 1
    return this.stack[this.cursor] ?? null
  }

  /**
   * Returns current active session ID from history cursor
   */
  current(): string | null {
    if (this.cursor >= 0 && this.cursor < this.stack.length) {
      return this.stack[this.cursor]
    }
    return null
  }

  /**
   * Cleans up a deleted session from history
   */
  remove(sessionId: string): void {
    if (!sessionId) return
    const idx = this.stack.indexOf(sessionId)
    if (idx === -1) return

    this.stack = this.stack.filter((id) => id !== sessionId)
    if (this.stack.length === 0) {
      this.cursor = -1
    } else if (this.cursor >= this.stack.length) {
      this.cursor = this.stack.length - 1
    } else if (idx < this.cursor) {
      this.cursor = Math.max(0, this.cursor - 1)
    }
  }

  get items(): readonly string[] {
    return this.stack
  }
}
