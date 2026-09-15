import React, { useState, useRef, useEffect, useMemo } from 'react'
import { CheckSquare, CheckCircle2, Circle, X } from 'lucide-react'
import type { TodoItem } from '../../types/opencode'
import { useI18n } from '../../utils/i18n'
import { getTodoStats, isTodoCompleted, isTodoInProgress, formatTodoTooltip } from './todo-state'
import { useAutoPosition } from '../../hooks/useAutoPosition'

export interface TodoButtonProps {
  todos?: TodoItem[] | null
}

export const TodoButton: React.FC<TodoButtonProps> = ({ todos }) => {
  const { lang } = useI18n()
  const isZh = lang?.startsWith('zh') ?? true
  // Default strictly hidden ("默认就要隐藏，别闲得没事弄出来")
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const {
    triggerRef,
    dropdownRef,
    placementClasses,
    alignClasses,
    style: autoStyle,
  } = useAutoPosition<HTMLButtonElement, HTMLDivElement>({
    isOpen,
    defaultPlacement: 'top',
    defaultAlign: 'start',
    margin: 8,
    padding: 8,
  })

  const stats = useMemo(() => getTodoStats(todos), [todos])

  // Close on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!todos || todos.length === 0) return null

  return (
    <div ref={containerRef} className="relative inline-flex items-center select-none">
      {/* Icon-only button beside '全部项目' (strictly no text) */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center justify-center w-6 h-6 rounded-md border transition-all cursor-pointer relative ${
          isOpen
            ? 'bg-[#1e222b] text-zinc-100 border-zinc-600 shadow-sm'
            : 'bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border-transparent'
        }`}
        title={formatTodoTooltip(todos, isZh)}
        aria-label={isZh ? '待办清单' : 'Todo List'}
      >
        <CheckSquare className="w-3.5 h-3.5" />
        {/* Subtle status badge indicator: amber if in-progress */}
        {stats.inProgress > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
        )}
      </button>

      {/* Floating Todo Popover when toggled open */}
      {isOpen && (
        <div
          ref={dropdownRef}
          style={autoStyle}
          className={`absolute ${alignClasses} ${placementClasses} w-80 sm:w-96 rounded-xl border border-[#272a31] bg-[#14161b]/95 backdrop-blur-md shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150 flex flex-col`}
          role="dialog"
          aria-label="Todo List"
        >
          {/* Header with Title and Explicit Hide Button */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#272a31] bg-[#181a20]">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-200">
                {isZh ? '待办清单' : 'Todos'}
              </span>
              <span className="text-[11px] text-zinc-400">
                ({stats.completed}/{stats.total})
              </span>
            </div>

            {/* Explicit Hide Button ("可以点击隐藏按钮隐藏") */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-colors cursor-pointer"
              title={isZh ? '隐藏' : 'Hide'}
              aria-label={isZh ? '隐藏' : 'Hide'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Todo List */}
          <div className="p-2.5 max-h-64 overflow-y-auto space-y-1 text-xs">
            {todos.map((todo, idx) => {
              const isDone = isTodoCompleted(todo)
              const inProgress = isTodoInProgress(todo)

              return (
                <div
                  key={todo.id || idx}
                  className={`flex items-start gap-2 py-1.5 px-2 rounded-lg transition-colors ${
                    inProgress
                      ? 'bg-amber-500/10 border border-amber-500/20 text-amber-200'
                      : isDone
                      ? 'text-zinc-500 bg-transparent'
                      : 'text-zinc-300 hover:bg-zinc-800/40'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : inProgress ? (
                    <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
                    </span>
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />
                  )}
                  <span className={`leading-relaxed break-words flex-1 ${isDone ? 'line-through' : ''}`}>
                    {todo.content || todo.title || `Task #${idx + 1}`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
