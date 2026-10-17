import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, Check, Sparkles, ChevronDown } from 'lucide-react'
import type { ProviderInfo } from '../../types/opencode'
import { isModelVisible } from '../../utils/model-filter'

export interface SideQuestionModel {
  providerID: string
  modelID: string
  name?: string
}

export interface SideQuestionModelSelectorProps {
  selectedModel: SideQuestionModel | null
  onSelectModel: (model: SideQuestionModel) => void
  providers: ProviderInfo[]
}

export function SideQuestionModelSelector({
  selectedModel,
  onSelectModel,
  providers,
}: SideQuestionModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Filter and group models by provider
  const groupedModels = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const groups: {
      providerID: string
      providerName: string
      models: { id: string; name: string }[]
    }[] = []

    providers.forEach((p) => {
      const visibleModels: { id: string; name: string }[] = []

      Object.entries(p.models || {}).forEach(([mId, mObj]) => {
        const name = (mObj as any)?.name || mId
        const visible = isModelVisible(p.id, mId, name)
        if (!visible) return

        if (q) {
          const matchProvider = (p.name || p.id).toLowerCase().includes(q)
          const matchId = mId.toLowerCase().includes(q)
          const matchName = name.toLowerCase().includes(q)
          if (!matchProvider && !matchId && !matchName) return
        }

        visibleModels.push({ id: mId, name })
      })

      if (visibleModels.length > 0) {
        groups.push({
          providerID: p.id,
          providerName: p.name || p.id,
          models: visibleModels,
        })
      }
    })

    return groups
  }, [providers, searchQuery])

  const displayName = selectedModel?.name || selectedModel?.modelID || '选择模型'

  return (
    <div className="relative inline-block select-none">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#181a20] hover:bg-[#22252e] border border-purple-500/30 text-purple-200 text-xs font-medium cursor-pointer transition-colors shadow-sm"
        title="切换 Side Question 模型 (Switch Side Question model)"
      >
        <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
        <span className="truncate max-w-[120px] text-[11px] font-sans">
          {displayName}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-zinc-400 shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-1.5 w-64 bg-[#14161d] border border-[#2b303b] rounded-lg shadow-2xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Search Input (Matches Image 3) */}
          <div className="p-1 pb-1.5">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索模型..."
                className="w-full pl-8 pr-2.5 py-1 bg-[#0c0d10] border border-[#272a32] focus:border-purple-500/80 focus:ring-1 focus:ring-purple-500/30 rounded-md text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none transition-all"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Grouped Model List by Provider (Matches Image 3) */}
          <div className="p-1 max-h-56 overflow-y-auto space-y-2 no-scrollbar">
            {groupedModels.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs text-zinc-500">
                未找到匹配模型
              </div>
            ) : (
              groupedModels.map((group) => (
                <div key={group.providerID} className="space-y-0.5">
                  <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                    {group.providerName}
                  </div>
                  {group.models.map((m) => {
                    const isSelected =
                      selectedModel?.providerID === group.providerID &&
                      selectedModel?.modelID === m.id

                    return (
                      <button
                        key={`${group.providerID}-${m.id}`}
                        type="button"
                        onClick={() => {
                          onSelectModel({
                            providerID: group.providerID,
                            modelID: m.id,
                            name: m.name,
                          })
                          setIsOpen(false)
                          setSearchQuery('')
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-purple-600/20 text-purple-300 font-medium'
                            : 'text-zinc-300 hover:bg-[#1e222a]'
                        }`}
                      >
                        <span className="truncate pr-2">{m.name || m.id}</span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
