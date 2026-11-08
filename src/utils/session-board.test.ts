import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createSessionBoard,
  moveBoardColumn,
  moveBoardGroup,
  moveBoardSession,
  normalizeSessionBoard,
  readSessionBoard,
  recentBoardSessions,
  saveSessionBoard,
  SESSION_BOARD_STORAGE_KEY,
  type SessionBoardState,
} from './session-board'

function boardWithSessions(ids: string[]): SessionBoardState {
  const state = createSessionBoard()
  return {
    ...state,
    columns: state.columns.map((column, index) => index === 0 ? {
      ...column,
      groups: [{ ...column.groups[0], sessionIds: ids }],
    } : column),
  }
}

describe('session board', () => {
  it('creates three named empty columns and groups', () => {
    const board = createSessionBoard()
    assert.equal(board.columns.length, 3)
    assert.deepEqual(board.columns.map((column) => column.name), ['Column 1', 'Column 2', 'Column 3'])
    assert.deepEqual(board.columns.map((column) => column.groups[0].name), ['Workspace', 'Projects', 'Later'])
    assert.ok(board.columns.every((column) => column.groups[0].sessionIds.length === 0))
  })

  it('keeps every stored recent ID while displaying 0, 8, or 12 eligible sessions', () => {
    const state = boardWithSessions([])
    const sessions = Array.from({ length: 12 }, (_, index) => ({ id: `s${index}`, time: { updated: index } }))
    assert.deepEqual(recentBoardSessions([], state), [])
    assert.equal(recentBoardSessions(sessions.slice(0, 8), state).length, 8)
    assert.equal(recentBoardSessions(sessions, state).length, 8)
    assert.equal(sessions.length, 12)
  })

  it('recycles old and new top sessions without losing IDs, and orders ties by recycle time', () => {
    const state = boardWithSessions(['old'])
    const afterOld = moveBoardSession(state, 'old', null, undefined, 1000)
    const afterNew = moveBoardSession(afterOld, 'new', null, undefined, 2000)
    const sessions = [
      { id: 'old', time: { updated: 1 } },
      { id: 'new', time: { updated: 2 } },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `other${i}`, time: { updated: 100 - i } })),
    ]
    const recent = recentBoardSessions(sessions, afterNew)
    assert.equal(recent.length, 8)
    assert.equal(recent[0].id, 'new')
    assert.deepEqual(Object.keys(afterNew.recycledAt).sort(), ['new', 'old'])
    assert.ok(sessions.some((session) => session.id === 'old'))
  })

  it('reorders within and across groups while maintaining unique membership', () => {
    const base = boardWithSessions(['a', 'b', 'c'])
    const sameGroup = moveBoardSession(base, 'c', 'group-1', 'a')
    assert.deepEqual(sameGroup.columns[0].groups[0].sessionIds, ['c', 'a', 'b'])
    const across = moveBoardSession(sameGroup, 'c', 'group-2')
    assert.deepEqual(across.columns[0].groups[0].sessionIds, ['a', 'b'])
    assert.deepEqual(across.columns[1].groups[0].sessionIds, ['c'])
    assert.equal(across.columns.flatMap((col) => col.groups.flatMap((group) => group.sessionIds)).filter((id) => id === 'c').length, 1)
    assert.equal(moveBoardSession(across, 'c', 'missing'), across)
    assert.equal(moveBoardSession(across, 'c', 'group-2', 'c'), across)
    const fromRecent = moveBoardSession(across, 'unassigned', 'group-2')
    assert.deepEqual(fromRecent.columns[1].groups[0].sessionIds, ['c', 'unassigned'])
  })

  it('moves groups between columns and columns before targets or to the end', () => {
    const state = createSessionBoard()
    const withGroup = {
      ...state,
      columns: state.columns.map((column, index) => index === 0
        ? { ...column, groups: [...column.groups, { id: 'extra', name: 'Extra', sessionIds: [], collapsed: false }] }
        : column),
    }
    const movedGroup = moveBoardGroup(withGroup, 'extra', 'column-2', 'group-2')
    assert.deepEqual(movedGroup.columns[0].groups.map((group) => group.id), ['group-1'])
    assert.deepEqual(movedGroup.columns[1].groups.map((group) => group.id), ['extra', 'group-2'])
    assert.equal(moveBoardGroup(movedGroup, 'extra', 'missing'), movedGroup)
    assert.deepEqual(moveBoardColumn(state, 'column-3', 'column-1').columns.map((column) => column.id), ['column-3', 'column-1', 'column-2'])
    assert.deepEqual(moveBoardColumn(state, 'column-1').columns.map((column) => column.id), ['column-2', 'column-3', 'column-1'])
  })

  it('rejects malformed state, duplicate IDs/membership, and invalid timestamps', () => {
    const valid = createSessionBoard()
    assert.deepEqual(normalizeSessionBoard({ ...valid, version: 2 }), createSessionBoard())
    const duplicated = boardWithSessions(['same'])
    duplicated.columns[1].groups[0].sessionIds.push('same')
    assert.deepEqual(normalizeSessionBoard(duplicated), createSessionBoard())
    const duplicateIds = createSessionBoard()
    duplicateIds.columns[1].groups[0].id = duplicateIds.columns[0].id
    assert.deepEqual(normalizeSessionBoard(duplicateIds), createSessionBoard())
    assert.deepEqual(normalizeSessionBoard({ ...valid, recycledAt: { x: Number.NaN } }), createSessionBoard())
  })

  it('reads corrupt storage as default, roundtrips valid state, and propagates write errors', () => {
    assert.deepEqual(readSessionBoard({ getItem: () => '{bad' }), createSessionBoard())
    const stored = new Map<string, string>()
    const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) }
    const state = boardWithSessions(['unloaded-session'])
    saveSessionBoard(state, storage)
    assert.equal(stored.has(SESSION_BOARD_STORAGE_KEY), true)
    assert.deepEqual(readSessionBoard(storage), state)
    assert.throws(() => saveSessionBoard(state, { setItem: () => { throw new Error('quota') } }), /quota/)
  })
})
