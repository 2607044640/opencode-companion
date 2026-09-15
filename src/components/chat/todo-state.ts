import type { TodoItem } from '../../types/opencode'

export interface TodoStats {
  total: number
  completed: number
  inProgress: number
  pending: number
}

export function isTodoCompleted(todo: TodoItem): boolean {
  return todo.status === 'completed' || todo.completed === true
}

export function isTodoInProgress(todo: TodoItem): boolean {
  return todo.status === 'in_progress'
}

export function getTodoStats(todos?: TodoItem[] | null): TodoStats {
  if (!todos || todos.length === 0) {
    return { total: 0, completed: 0, inProgress: 0, pending: 0 }
  }

  let completed = 0
  let inProgress = 0
  let pending = 0

  for (const todo of todos) {
    if (isTodoCompleted(todo)) {
      completed++
    } else if (isTodoInProgress(todo)) {
      inProgress++
    } else {
      pending++
    }
  }

  return {
    total: todos.length,
    completed,
    inProgress,
    pending,
  }
}

export function formatTodoTooltip(todos: TodoItem[], isZh: boolean = true): string {
  const stats = getTodoStats(todos)
  if (isZh) {
    return `待办清单 (${stats.completed}/${stats.total})`
  }
  return `Todo List (${stats.completed}/${stats.total})`
}
