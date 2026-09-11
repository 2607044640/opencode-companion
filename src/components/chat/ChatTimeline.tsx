import { useEffect, useRef } from 'react'
import { AlertTriangle, Play, Sparkles, MessageSquare } from 'lucide-react'
import type { Message, SessionStatusPayload } from '../../types/opencode'
import { MessageBubble } from './MessageBubble'

interface ChatTimelineProps {
  messages: Message[]
  sessionStatus: SessionStatusPayload
  error?: string | null
  onRetry: () => void
  onPromptSuggestion?: (text: string) => void
  isZenMode?: boolean
}

export function ChatTimeline({
  messages,
  sessionStatus,
  error,
  onRetry,
  onPromptSuggestion,
  isZenMode,
}: ChatTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isAutoScrollEnabled = useRef(true)

  // Track if user scrolled up manually
  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 80
    isAutoScrollEnabled.current = isAtBottom
  }

  useEffect(() => {
    if (isAutoScrollEnabled.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, sessionStatus])

  const suggestions = [
    '列出当前工作区的所有文件结构',
    '检查并优化当前代码模块',
    '运行测试并给出审查意见',
  ]

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`flex-1 overflow-y-auto transition-colors duration-300 ${
        isZenMode ? 'px-4 sm:px-8 py-8 bg-[#090a0c]' : 'px-2 py-4'
      }`}
    >
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 select-none">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-600/20 to-purple-600/20 border border-zinc-800 flex items-center justify-center mb-4 text-orange-400 shadow-inner">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-200 mb-1">OpenCode Companion</h2>
          <p className="text-xs text-zinc-400 max-w-sm mb-6">
            {isZenMode
              ? '当前处于沉浸全屏阅读模式。在此模式下可心无旁骛地与 AI 进行深度阅读与交互。'
              : '独立运行在 Windows 宿主的 OpenCode 伴侣工作台，实时串联 WSL2 守护进程。'}
          </p>

          <div className="flex flex-col sm:flex-row gap-2 max-w-md w-full">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => onPromptSuggestion?.(s)}
                className="flex-1 p-2.5 rounded-lg bg-[#14161a] hover:bg-[#1a1d22] border border-[#24272c] text-left text-xs text-zinc-300 hover:text-white transition-all flex items-center gap-2 group"
              >
                <Sparkles className="w-3.5 h-3.5 text-orange-400 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="truncate">{s}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          className={`mx-auto w-full transition-all duration-300 ${
            isZenMode ? 'max-w-4xl space-y-6 pb-36' : 'space-y-4'
          }`}
        >
          {messages.map((msg) => (
            <MessageBubble key={msg.info.id} message={msg} isZenMode={isZenMode} />
          ))}

          {/* Error / Retry Banner (Exact Replicate of Image 1) */}
          {(sessionStatus.type === 'retry' || Boolean(error)) && (
            <div className="max-w-4xl mx-auto my-4 px-4">
              <div className="relative overflow-hidden rounded-lg bg-[#1a1315] border border-rose-900/40 p-3.5 flex items-center justify-between gap-4 shadow-md">
                {/* Red Left Accent Indicator (from Image 1) */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-600" />

                <div className="flex items-center gap-3 pl-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <div className="text-xs text-rose-200">
                    <span className="font-medium">
                      {error || sessionStatus.message || "An error occurred during generation. Please try again."}
                    </span>
                    {sessionStatus.attempt ? (
                      <span className="text-rose-400/80 ml-2 font-mono text-[11px]">
                        (Attempt {sessionStatus.attempt})
                      </span>
                    ) : null}
                  </div>
                </div>

                <button
                  onClick={onRetry}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  <Play className="w-3 h-3" />
                  <span>重试 / 继续</span>
                </button>
              </div>
            </div>
          )}

          <div ref={bottomRef} className={isZenMode ? 'h-6' : 'h-2'} />
        </div>
      )}
    </div>
  )
}
