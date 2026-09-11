/**
 * Blueprint Hotkey Reservation Helper
 * Prevents the modal's global keystroke redirection from swallowing
 * Unreal Engine Blueprint shortcuts (F, C, Home, Space, Ctrl+A, Delete)
 * when the search input is NOT actively focused.
 */

export function isBlueprintReservedKey(event: KeyboardEvent, isSearchFocused: boolean): boolean {
  if (isSearchFocused) {
    // When the user has intentionally focused the search box, all characters should be typed normally
    return false
  }

  const key = event.key.toLowerCase()

  // Alt+R: Rearrange Blueprint Graph
  if (key === "r" && event.altKey && !event.ctrlKey && !event.metaKey) {
    return true
  }

  // Don't intercept if modifier combinations like Alt are pressed
  if (event.altKey) {
    return false
  }

  // F: Frame / Focus selected nodes (or fit entire graph)
  if (key === "f" && !event.ctrlKey && !event.metaKey) {
    return true
  }

  // C: Wrap selected nodes into a Comment Group
  if (key === "c" && !event.ctrlKey && !event.metaKey) {
    return true
  }

  // Home: Reset view to overview
  if (key === "home") {
    return true
  }

  // Space: Space-drag pan
  if (key === " " || key === "spacebar") {
    return true
  }

  // Ctrl+A / Cmd+A: Select all nodes
  if (key === "a" && (event.ctrlKey || event.metaKey)) {
    return true
  }

  // Ctrl+Z / Cmd+Z (Undo / Redo) and Ctrl+Y (Redo)
  if ((key === "z" || key === "y") && (event.ctrlKey || event.metaKey)) {
    return true
  }

  // Delete / Backspace
  if (key === "delete" || key === "backspace") {
    return true
  }

  return false
}
