import type { TalkMap } from "../schema/talk-map"
import { assignCardToGroup } from "./group-commands"

export type Digit = "1" | "2" | "3"

export function groupsByCreatedAt(map: TalkMap, directory: string): readonly string[] {
  return Object.values(map.groups)
    .filter((group) => group.directory === directory)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((group) => group.groupId)
}

export function boundGroupId(map: TalkMap, directory: string, digit: Digit): string | undefined {
  const rebound = map.global.hotkeys[digit]
  if (rebound !== undefined && map.groups[rebound] !== undefined) {
    return rebound
  }
  const ordered = groupsByCreatedAt(map, directory)
  const index = Number(digit) - 1
  return ordered[index]
}

export function bindHotkey(map: TalkMap, digit: Digit, groupId: string): TalkMap {
  return {
    ...map,
    global: {
      ...map.global,
      hotkeys: { ...map.global.hotkeys, [digit]: groupId },
    },
  }
}

export function handleGroupHotkey(input: {
  readonly map: TalkMap
  readonly directory: string
  readonly digit: Digit
  readonly selectedCardIds: readonly string[]
}): TalkMap | null {
  const groupId = boundGroupId(input.map, input.directory, input.digit)
  if (groupId === undefined || input.selectedCardIds.length === 0) {
    return null
  }
  let next = input.map
  for (const cardId of input.selectedCardIds) {
    next = assignCardToGroup(next, cardId, groupId)
  }
  return next
}

export function digitFromKeyboardEvent(event: KeyboardEvent): Digit | undefined {
  if (event.isComposing || event.keyCode === 229) {
    return undefined
  }
  if (!event.ctrlKey || event.altKey || event.shiftKey) {
    return undefined
  }
  if (event.key === "1" || event.key === "2" || event.key === "3") {
    return event.key
  }
  return undefined
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) {
    return false
  }
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable
}
