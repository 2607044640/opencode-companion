import { useState, useCallback } from 'react'
import { RotateCcw, GitBranch, MessageSquare, Loader2, X } from 'lucide-react'

interface RevertDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (opts: {
    includeUserMessage: boolean
    gitRevert: boolean
    gitRevertMode: 'revert' | 'reset'
  }) => Promise<void>
  hasDirectory: boolean
}

function RevertDialog({ isOpen, onClose, onConfirm, hasDirectory }: RevertDialogProps) {
  const [includeUser, setIncludeUser] = useState(true)
  const [gitRevert, setGitRevert] = useState(false)
  const [gitMode, setGitMode] = useState<'revert' | 'reset'>('revert')
  const [loading, setLoading] = useState(false)

  const handleConfirm = useCallback(async () => {
    setLoading(true)
    try {
      await onConfirm({ includeUserMessage: includeUser, gitRevert, gitRevertMode: gitMode })
    } finally {
      setLoading(false)
      onClose()
    }
  }, [onConfirm, includeUser, gitRevert, gitMode, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[440px] max-w-[96vw] bg-[#13151a] border border-[#2a2d35] rounded-xl shadow-2xl p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-400">
            <RotateCcw className="w-4 h-4" />
            <span className="text-sm font-semibold">撤回最后一轮对话</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          将从会话历史中删除 AI 最后一条回复。此操作<strong className="text-zinc-200">不可撤销</strong>。
        </p>

        {/* Options */}
        <div className="flex flex-col gap-3">
          {/* Include user message */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={includeUser}
              onChange={(e) => setIncludeUser(e.target.checked)}
              className="mt-0.5 accent-amber-500"
            />
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-200 group-hover:text-white">
                <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                同时删除配对的用户消息
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">删除触发该回复的问题，彻底清除这一轮</p>
            </div>
          </label>

          {/* Git revert */}
          {hasDirectory && (
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={gitRevert}
                onChange={(e) => setGitRevert(e.target.checked)}
                className="mt-0.5 accent-amber-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-200 group-hover:text-white">
                  <GitBranch className="w-3.5 h-3.5 text-amber-400" />
                  同时 Git Revert 文件快照
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">回滚 AI 在工作区执行的文件变更（需该目录已被 git 追踪）</p>

                {/* Git mode sub-options */}
                {gitRevert && (
                  <div className="mt-2 flex gap-3">
                    <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                      <input
                        type="radio"
                        name="git-mode"
                        value="revert"
                        checked={gitMode === 'revert'}
                        onChange={() => setGitMode('revert')}
                        className="accent-amber-500"
                      />
                      <span><code className="text-amber-300 bg-amber-950/40 px-1 rounded">git revert HEAD</code> （安全，保留历史）</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                      <input
                        type="radio"
                        name="git-mode"
                        value="reset"
                        checked={gitMode === 'reset'}
                        onChange={() => setGitMode('reset')}
                        className="accent-amber-500"
                      />
                      <span><code className="text-red-300 bg-red-950/40 px-1 rounded">git reset HEAD~1</code> （销毁提交）</span>
                    </label>
                  </div>
                )}
              </div>
            </label>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1 border-t border-[#2a2d35]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => { void handleConfirm() }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors active:scale-95"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            确认撤回
          </button>
        </div>
      </div>
    </div>
  )
}

interface RevertButtonProps {
  hasMessages: boolean
  onRevert: () => void
}

export function RevertButton({ hasMessages, onRevert }: RevertButtonProps) {
  if (!hasMessages) return null
  return (
    <button
      type="button"
      onClick={onRevert}
      title="撤回最后一轮对话 (Revert last exchange)"
      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-amber-400/80 hover:text-amber-300 hover:bg-amber-950/30 border border-amber-800/30 hover:border-amber-700/60 rounded transition-all active:scale-95 shrink-0"
    >
      <RotateCcw className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">撤回</span>
    </button>
  )
}

export { RevertDialog }
