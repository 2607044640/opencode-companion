import React, { useState, useEffect, useRef } from 'react'
import { FolderPlus, X, Folder, AlertCircle } from 'lucide-react'
import { useI18n } from '../../utils/i18n'

export interface NewProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (name: string, path: string) => Promise<void> | void
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const { lang } = useI18n()
  const isZh = lang.startsWith('zh')
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setName('')
      setPath('')
      setError(null)
      setLoading(false)
      setTimeout(() => nameInputRef.current?.focus(), 50)
    }
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

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedPath = path.trim()

    if (!trimmedName) {
      setError(isZh ? '项目名称不能为空' : 'Project name cannot be empty')
      return
    }

    if (!trimmedPath) {
      setError(isZh ? '工作目录路径不能为空' : 'Project directory path cannot be empty')
      return
    }

    try {
      setLoading(true)
      setError(null)
      await onConfirm(trimmedName, trimmedPath)
      onClose()
    } catch (err: any) {
      setError(err?.message || (isZh ? '创建项目失败，请检查路径' : 'Failed to register project'))
    } finally {
      setLoading(false)
    }
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

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
            <FolderPlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              {isZh ? '新建工作区项目' : 'New Workspace Project'}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {isZh ? '注册新的文件夹目录作为独立的工作空间' : 'Register a new folder as an isolated workspace'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {isZh ? '项目名称' : 'Project Name'}
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isZh ? '例如：MyNewApp' : 'e.g. MyNewApp'}
              className="w-full px-3 py-2 bg-[#0d0f14] border border-[#242834] rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/30 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {isZh ? '项目目录绝对路径' : 'Absolute Directory Path'}
            </label>
            <div className="relative">
              <Folder className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder={isZh ? '例如：C:/projects/my-project 或 /workspace/projects/...' : 'e.g. /workspace/projects/my-project'}
                className="w-full pl-9 pr-3 py-2 bg-[#0d0f14] border border-[#242834] rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-orange-500/80 focus:ring-1 focus:ring-orange-500/30 transition-all font-mono"
              />
            </div>
            <span className="block text-[11px] text-zinc-500 mt-1">
              {isZh ? '支持 Windows 路径或 WSL Linux 绝对路径' : 'Supports Windows or WSL Linux absolute paths'}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#21242e]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              {isZh ? '取消' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim() || !path.trim()}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all shadow-md ${
                loading || !name.trim() || !path.trim()
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-500 text-white cursor-pointer active:scale-95'
              }`}
            >
              {loading ? (isZh ? '添加中...' : 'Adding...') : (isZh ? '确认添加' : 'Add Project')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
