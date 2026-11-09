/**
 * Titlebar and theme-color synchronization utility
 * Controls the PWA / Edge desktop app window title bar color.
 */

export const DEFAULT_LIGHT_TITLEBAR_COLOR = '#1e222d'
export const DARK_TITLEBAR_COLOR = '#0c0d0e'
export const TRANSLUCENT_TITLEBAR_COLOR = '#222634'

export function resolveTitlebarColor(options?: {
  lightTitlebar?: boolean
  translucentUiChrome?: boolean
}): string {
  if (options?.lightTitlebar === false) {
    return DARK_TITLEBAR_COLOR
  }
  if (options?.translucentUiChrome) {
    return TRANSLUCENT_TITLEBAR_COLOR
  }
  return DEFAULT_LIGHT_TITLEBAR_COLOR
}

export function syncTitlebarThemeColor(
  color: string,
  doc?: Document | null
): void {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!targetDoc) return

  let meta = targetDoc.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = targetDoc.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    if (targetDoc.head) {
      targetDoc.head.appendChild(meta)
    }
  }
  meta.setAttribute('content', color)
}
