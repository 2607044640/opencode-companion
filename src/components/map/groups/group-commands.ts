import type { TalkMap } from "../schema/talk-map"

export const GROUP_PADDING = 24
export const CARD_WIDTH = 240
export const CARD_HEIGHT = 96
export const DEFAULT_GROUP_COLOR = "#3a4150"

export type RubberBandBox = {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export type CreateGroupFromRubberBandInput = {
  readonly map: TalkMap
  readonly directory: string
  readonly box: RubberBandBox
  readonly now: number
  readonly newGroupId: () => string
}

function normalizeBox(box: RubberBandBox): RubberBandBox {
  const x = box.w < 0 ? box.x + box.w : box.x
  const y = box.h < 0 ? box.y + box.h : box.y
  return { x, y, w: Math.abs(box.w), h: Math.abs(box.h) }
}

function cardFullyInside(card: TalkMap["cards"][string], box: RubberBandBox): boolean {
  const left = card.position.x
  const top = card.position.y
  const right = left + CARD_WIDTH
  const bottom = top + CARD_HEIGHT
  return left >= box.x && top >= box.y && right <= box.x + box.w && bottom <= box.y + box.h
}

function nextGroupTitle(map: TalkMap, directory: string): string {
  const count = Object.values(map.groups).filter((group) => group.directory === directory).length
  return `Group ${count + 1}`
}

function boardOf(map: TalkMap, directory: string) {
  const existing = map.boards[directory]
  if (existing !== undefined) {
    return existing
  }
  return { cardIds: [] as string[], groupIds: [] as string[] }
}

function removeCardFromGroup(map: TalkMap, cardId: string, groupId: string): TalkMap {
  const group = map.groups[groupId]
  if (group === undefined) {
    return map
  }
  return {
    ...map,
    groups: {
      ...map.groups,
      [groupId]: {
        ...group,
        childCardIds: group.childCardIds.filter((id) => id !== cardId),
      },
    },
  }
}

export function assignCardToGroup(map: TalkMap, cardId: string, groupId: string | null): TalkMap {
  const card = map.cards[cardId]
  if (card === undefined) {
    return map
  }
  let next = map
  const previous = card.groupId
  if (previous !== undefined && previous !== null && previous !== groupId) {
    next = removeCardFromGroup(next, cardId, previous)
  }
  if (groupId === null) {
    return {
      ...next,
      cards: {
        ...next.cards,
        [cardId]: { ...card, groupId: null },
      },
    }
  }
  const group = next.groups[groupId]
  if (group === undefined) {
    return next
  }
  const childCardIds = group.childCardIds.includes(cardId)
    ? group.childCardIds
    : [...group.childCardIds, cardId]
  return {
    ...next,
    cards: {
      ...next.cards,
      [cardId]: { ...card, groupId },
    },
    groups: {
      ...next.groups,
      [groupId]: { ...group, childCardIds },
    },
  }
}

export function createGroupFromRubberBand(
  input: CreateGroupFromRubberBandInput,
): TalkMap | null {
  const box = normalizeBox(input.box)
  const enclosed = Object.values(input.map.cards).filter(
    (card) => card.directory === input.directory && cardFullyInside(card, box),
  )
  if (enclosed.length === 0) {
    return null
  }

  const groupId = input.newGroupId()
  const xs = enclosed.map((card) => card.position.x)
  const ys = enclosed.map((card) => card.position.y)
  const rights = enclosed.map((card) => card.position.x + CARD_WIDTH)
  const bottoms = enclosed.map((card) => card.position.y + CARD_HEIGHT)
  const minX = Math.min(...xs) - GROUP_PADDING
  const minY = Math.min(...ys) - GROUP_PADDING
  const maxX = Math.max(...rights) + GROUP_PADDING
  const maxY = Math.max(...bottoms) + GROUP_PADDING
  const board = boardOf(input.map, input.directory)

  let next: TalkMap = {
    ...input.map,
    groups: {
      ...input.map.groups,
      [groupId]: {
        groupId,
        title: nextGroupTitle(input.map, input.directory),
        color: DEFAULT_GROUP_COLOR,
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
        childCardIds: [],
        createdAt: input.now,
        directory: input.directory,
      },
    },
    boards: {
      ...input.map.boards,
      [input.directory]: {
        ...board,
        groupIds: [...board.groupIds, groupId],
      },
    },
  }

  for (const card of enclosed) {
    next = assignCardToGroup(next, card.cardId, groupId)
  }
  return next
}

export function createGroupFromSelectedCards(input: {
  readonly map: TalkMap
  readonly directory: string
  readonly selectedCardIds: readonly string[]
  readonly newGroupId: () => string
  readonly now?: number
}): TalkMap | null {
  const cards = input.selectedCardIds
    .map((id) => input.map.cards[id])
    .filter((card): card is NonNullable<typeof card> => card !== undefined && card.directory === input.directory)

  if (cards.length === 0) {
    return null
  }

  const groupId = input.newGroupId()
  const xs = cards.map((card) => card.position.x)
  const ys = cards.map((card) => card.position.y)
  const rights = cards.map((card) => card.position.x + CARD_WIDTH)
  const bottoms = cards.map((card) => card.position.y + CARD_HEIGHT)
  const minX = Math.min(...xs) - GROUP_PADDING
  const minY = Math.min(...ys) - GROUP_PADDING
  const maxX = Math.max(...rights) + GROUP_PADDING
  const maxY = Math.max(...bottoms) + GROUP_PADDING
  const board = boardOf(input.map, input.directory)

  let next: TalkMap = {
    ...input.map,
    groups: {
      ...input.map.groups,
      [groupId]: {
        groupId,
        title: nextGroupTitle(input.map, input.directory),
        color: DEFAULT_GROUP_COLOR,
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
        childCardIds: [],
        createdAt: input.now ?? Date.now(),
        directory: input.directory,
      },
    },
    boards: {
      ...input.map.boards,
      [input.directory]: {
        ...board,
        groupIds: [...board.groupIds, groupId],
      },
    },
  }

  for (const card of cards) {
    next = assignCardToGroup(next, card.cardId, groupId)
  }
  return next
}

export function translateGroup(
  map: TalkMap,
  groupId: string,
  delta: { readonly x: number; readonly y: number },
): TalkMap {
  const group = map.groups[groupId]
  if (group === undefined) {
    return map
  }
  const cards = { ...map.cards }
  for (const cardId of group.childCardIds) {
    const card = cards[cardId]
    if (card === undefined) {
      continue
    }
    cards[cardId] = {
      ...card,
      position: { x: card.position.x + delta.x, y: card.position.y + delta.y },
    }
  }
  return {
    ...map,
    cards,
    groups: {
      ...map.groups,
      [groupId]: {
        ...group,
        x: group.x + delta.x,
        y: group.y + delta.y,
      },
    },
  }
}

/**
 * Checks if a card's bounding box intersects or overlaps an existing group.
 */
export function isCardOverlappingGroup(
  cardPos: { readonly x: number; readonly y: number },
  group: TalkMap["groups"][string],
): boolean {
  const cardRight = cardPos.x + CARD_WIDTH
  const cardBottom = cardPos.y + CARD_HEIGHT
  const groupRight = group.x + group.w
  const groupBottom = group.y + group.h

  return !(
    cardRight < group.x ||
    cardPos.x > groupRight ||
    cardBottom < group.y ||
    cardPos.y > groupBottom
  )
}

/**
 * Expands a group's bounding box to encompass a card position with padding.
 */
export function expandGroupToEncloseCard(
  group: TalkMap["groups"][string],
  cardPos: { readonly x: number; readonly y: number },
): TalkMap["groups"][string] {
  const cardRight = cardPos.x + CARD_WIDTH
  const cardBottom = cardPos.y + CARD_HEIGHT
  const minX = Math.min(group.x, cardPos.x - GROUP_PADDING)
  const minY = Math.min(group.y, cardPos.y - GROUP_PADDING)
  const maxX = Math.max(group.x + group.w, cardRight + GROUP_PADDING)
  const maxY = Math.max(group.y + group.h, cardBottom + GROUP_PADDING)

  return {
    ...group,
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  }
}

/**
 * Handles dropping a card:
 * 1. Checks if the card was dropped onto an existing comment group.
 * 2. If so, assigns the card to the group and auto-expands the group bounds.
 * 3. If dragged outside all groups, removes the card from its previous group.
 */
export function applyCardDropToGroups(
  map: TalkMap,
  cardId: string,
  newPosition: { readonly x: number; readonly y: number },
): TalkMap {
  const card = map.cards[cardId]
  if (card === undefined) {
    return map
  }

  // Update card position first
  let next: TalkMap = {
    ...map,
    cards: {
      ...map.cards,
      [cardId]: { ...card, position: newPosition },
    },
  }

  // Find overlapping groups in the same directory
  const candidateGroups = Object.values(next.groups).filter(
    (g) => g.directory === card.directory && isCardOverlappingGroup(newPosition, g),
  )

  if (candidateGroups.length > 0) {
    // Target the first overlapping group
    const targetGroup = candidateGroups[0]
    next = assignCardToGroup(next, cardId, targetGroup.groupId)

    // Auto-expand target group bounding box
    const currentGroup = next.groups[targetGroup.groupId]
    if (currentGroup) {
      const expanded = expandGroupToEncloseCard(currentGroup, newPosition)
      next = {
        ...next,
        groups: {
          ...next.groups,
          [targetGroup.groupId]: expanded,
        },
      }
    }
  } else if (card.groupId) {
    // Dragged outside all groups - detach from former group
    next = assignCardToGroup(next, cardId, null)
  }

  return next
}

/**
 * Resizes a comment group with new 4-corner / edge dimensions.
 */
export function resizeGroup(
  map: TalkMap,
  groupId: string,
  bounds: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
): TalkMap {
  const group = map.groups[groupId]
  if (group === undefined) {
    return map
  }
  const minW = Math.max(140, bounds.w)
  const minH = Math.max(80, bounds.h)

  return {
    ...map,
    groups: {
      ...map.groups,
      [groupId]: {
        ...group,
        x: bounds.x,
        y: bounds.y,
        w: minW,
        h: minH,
      },
    },
  }
}

/**
 * Deletes a comment group completely from the map:
 * - Unbinds all child cards (sets card.groupId = null)
 * - Removes group from board.groupIds
 * - Deletes from map.groups
 */
export function deleteGroupFromMap(map: TalkMap, groupId: string): TalkMap {
  const group = map.groups[groupId]
  if (group === undefined) {
    return map
  }

  // Unlink child cards
  const cards = { ...map.cards }
  for (const cardId of group.childCardIds) {
    const card = cards[cardId]
    if (card && card.groupId === groupId) {
      cards[cardId] = { ...card, groupId: null }
    }
  }

  // Remove from groups
  const groups = { ...map.groups }
  delete groups[groupId]

  // Remove from boards
  const boards = { ...map.boards }
  const board = boards[group.directory]
  if (board) {
    boards[group.directory] = {
      ...board,
      groupIds: board.groupIds.filter((id) => id !== groupId),
    }
  }

  return {
    ...map,
    cards,
    groups,
    boards,
  }
}
