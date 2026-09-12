import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { syncSessions, type SyncSession } from './session-sync'
import { emptyTalkMap, type TalkMap } from '../schema/talk-map'

describe('session-sync manual addition invariants', () => {
  test('syncSessions does not automatically insert cards for sessions not in map', () => {
    const empty = emptyTalkMap()
    const sessions: SyncSession[] = [
      { id: 'sess_1', title: 'First Session', directory: '/projects/APISpace', timeUpdated: 1000 },
      { id: 'sess_2', title: 'Second Session', directory: '/projects/APISpace', timeUpdated: 2000 },
    ]

    let cardCounter = 0
    const newCardId = () => `card_${++cardCounter}`

    const synced = syncSessions({
      map: empty,
      sessions,
      directory: '/projects/APISpace',
      newCardId,
    })

    // Cards should remain empty because sessions are no longer automatically inserted!
    assert.equal(Object.keys(synced.cards).length, 0)
    assert.equal(cardCounter, 0)
  })

  test('syncSessions preserves and updates cards that were explicitly added', () => {
    const initialMap: TalkMap = {
      ...emptyTalkMap(),
      cards: {
        card_1: {
          cardId: 'card_1',
          sessionId: 'sess_1',
          ghost: true,
          position: { x: 50, y: 50 },
          directory: '/projects/APISpace',
        },
      },
      boards: {
        '/projects/APISpace': {
          cardIds: ['card_1'],
          groupIds: [],
        },
      },
    }

    const sessions: SyncSession[] = [
      { id: 'sess_1', title: 'First Session Updated', directory: '/projects/APISpace', timeUpdated: 3000 },
    ]

    const synced = syncSessions({
      map: initialMap,
      sessions,
      directory: '/projects/APISpace',
      newCardId: () => 'card_new',
    })

    // card_1 is unghosted and preserved
    assert.equal(synced.cards.card_1.ghost, false)
    assert.equal(synced.cards.card_1.sessionId, 'sess_1')
    assert.equal(Object.keys(synced.cards).length, 1)
  })
})
