import { useState } from 'react'
import { CheckSquare, ChevronUp, ChevronDown, CheckCircle2, Circle, X } from 'lucide-react'
import type { TodoItem } from '../../types/opencode'
export { TodoButton } from './TodoButton'

interface TodoBannerProps {
  todos: TodoItem[]
  isZenMode?: boolean
}

export function TodoBanner({ todos, isZenMode }: TodoBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  if (isDismissed || !todos || todos.length === 0) return null

  const total = todos.length
  const completedCount = todos.filter(
    (t) => t.status === 'completed' || t.completed === true
  ).length
  const activeTodo = todos.find(
    (t) => t.status === 'in_progress' || (!t.completed && t.status !== 'completed')
  )

  return (
    <div
      className={
        isZenMode
          ? 'w-full select-none opacity-60 hover:opacity-100 transition-all duration-300'
          : 'mx-auto w-full px-4 sm:px-6 lg:px-8 mb-2 select-none max-w-4xl xl:max-w-5xl'
      }
    >
      <div
        className={`rounded-lg border shadow-lg overflow-hidden text-xs transition-all ${
          isZenMode
            ? 'bg-[#14161b]/90 backdrop-blur-md border-zinc-700/60 shadow-2xl'
            : 'bg-[#14161b] border-[#272a31]'
        }`}
      >
        {/* Floating Todo Bar (Exact Replicate of Image 1) */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#191c22] transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CheckSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="font-semibold text-zinc-200 shrink-0">
              {completedCount} of {total} todos completed
            </span>
            {activeTodo && (
              <span className="text-zinc-400 truncate text-[11px]" title={activeTodo.content || activeTodo.title}>
                {activeTodo.content || activeTodo.title}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded(!isExpanded)
              }}
              className="text-zinc-400 hover:text-zinc-200 p-0.5 rounded cursor-pointer"
              title={isExpanded ? '收起' : '展开'}
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsDismissed(true)
              }}
              className="text-zinc-400 hover:text-zinc-200 p-0.5 rounded cursor-pointer"
              title="隐藏"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Expanded Todo Items List */}
        {isExpanded && (
          <div className="p-3 border-t border-[#272a31] bg-[#0e1014] max-h-48 overflow-y-auto space-y-1.5">
            {todos.map((todo, idx) => {
              const isDone = todo.status === 'completed' || todo.completed === true
              const isInProgress = todo.status === 'in_progress'

              return (
                <div
                  key={todo.id || idx}
                  className={`flex items-start gap-2 text-xs py-1 px-2 rounded ${
                    isInProgress ? 'bg-purple-950/30 text-purple-200' : 'text-zinc-300'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <Circle
                      className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                        isInProgress ? 'text-purple-400' : 'text-zinc-600'
                      }`}
                    />
                  )}
                  <span className={`leading-tight ${isDone ? 'line-through text-zinc-500' : ''}`}>
                    {todo.content || todo.title || `Task #${idx + 1}`}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
