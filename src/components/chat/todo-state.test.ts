import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getTodoStats, isTodoCompleted, isTodoInProgress, formatTodoTooltip } from './todo-state'
import type { TodoItem } from '../../types/opencode'

describe('Todo State Helpers', () => {
  it('handles empty or null todos gracefully', () => {
    assert.deepEqual(getTodoStats(null), { total: 0, completed: 0, inProgress: 0, pending: 0 })
    assert.deepEqual(getTodoStats([]), { total: 0, completed: 0, inProgress: 0, pending: 0 })
  })

  it('calculates completed, in-progress, and pending counts correctly', () => {
    const mockTodos: TodoItem[] = [
      { id: '1', title: 'Task 1', status: 'completed' },
      { id: '2', title: 'Task 2', completed: true },
      { id: '3', title: 'Task 3', status: 'in_progress' },
      { id: '4', title: 'Task 4', status: 'pending' },
      { id: '5', title: 'Task 5' },
    ]

    const stats = getTodoStats(mockTodos)
    assert.equal(stats.total, 5)
    assert.equal(stats.completed, 2)
    assert.equal(stats.inProgress, 1)
    assert.equal(stats.pending, 2)

    assert.equal(isTodoCompleted(mockTodos[0]), true)
    assert.equal(isTodoCompleted(mockTodos[1]), true)
    assert.equal(isTodoCompleted(mockTodos[2]), false)
    assert.equal(isTodoInProgress(mockTodos[2]), true)
    assert.equal(isTodoInProgress(mockTodos[3]), false)
  })

  it('formats tooltip text correctly in Chinese and English', () => {
    const mockTodos: TodoItem[] = [
      { id: '1', title: 'Task 1', status: 'completed' },
      { id: '2', title: 'Task 2', status: 'pending' },
    ]

    assert.equal(formatTodoTooltip(mockTodos, true), '待办清单 (1/2)')
    assert.equal(formatTodoTooltip(mockTodos, false), 'Todo List (1/2)')
  })
})
