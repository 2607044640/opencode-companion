import React, { useEffect, useState } from 'react'
import { Folder, Copy, Check, X, HardDrive } from 'lucide-react'
import type { Project } from '../../types/opencode'
import { useI18n } from '../../utils/i18n'

export interface ProjectSettingsModalProps {
  isOpen: boolean
  project: Project | null
  sessionCount?: number
  onClose: () => void
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  isOpen,
  project,
  sessionCount = 0,
  onClose,
}) => {
  const { lang } = useI18n()
  const isZh = lang.startsWith('zh')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCopied(false)
  }, [isOpen])

  // Handle Escape key to cancel
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !project) return null

  const handleCopyPath = () => {
    if (!project.worktree) return
    navigator.clipboard.writeText(project.worktree).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-2xl bg-[#14161d] border border-[#272b36] shadow-2xl p-6 text-zinc-100 relative"
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-800 transition-colors cursor-pointer"
          title={isZh ? '关闭' : 'Close'}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Folder className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <span>{project.name || 'Project'}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                ID: {project.id.slice(0, 8)}
              </span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {isZh ? '工作区配置与路径信息' : 'Workspace configuration & path details'}
            </p>
          </div>
        </div>

        <div className="space-y-3.5 text-xs">
          <div>
            <label className="block text-zinc-400 mb-1 font-medium">
              {isZh ? '根工作目录 (Worktree)' : 'Root Worktree'}
            </label>
            <div className="flex items-center gap-2 bg-[#0c0e12] border border-[#232732] rounded-lg px-3 py-2">
              <span className="font-mono text-zinc-200 select-all truncate flex-1">
                {project.worktree || '/'}
              </span>
              <button
                type="button"
                onClick={handleCopyPath}
                className="p-1 text-zinc-400 hover:text-zinc-100 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                title={isZh ? '复制路径' : 'Copy path'}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-2.5 rounded-lg bg-[#0c0e12] border border-[#232732]">
              <div className="text-zinc-500 text-[11px] flex items-center gap-1.5 mb-1">
                <HardDrive className="w-3 h-3" />
                <span>{isZh ? '会话总数' : 'Sessions'}</span>
              </div>
              <div className="text-base font-semibold text-zinc-100 font-mono">
                {sessionCount}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-[#0c0e12] border border-[#232732]">
              <div className="text-zinc-500 text-[11px] mb-1">
                {isZh ? '状态' : 'Status'}
              </div>
              <div className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{isZh ? '已挂载就绪' : 'Mounted & Ready'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end pt-5 mt-4 border-t border-[#21242e]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"
          >
            {isZh ? '完成' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
