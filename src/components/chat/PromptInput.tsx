import { useState, useEffect, useRef, useMemo, type ChangeEvent, type KeyboardEvent, type ClipboardEvent } from 'react'
import {
  Plus,
  Send,
  Square,
  Sparkles,
  ChevronDown,
  Bot,
  Image as ImageIcon,
  X,
} from 'lucide-react'
import type { AgentInfo, ProviderInfo, Session, CommandItem } from '../../types/opencode'
import type { PromptAttachment } from '../../hooks/useChatStream'
import { api } from '../../services/api'
import { PromptPopover, type PopoverItem } from './PromptPopover'
import { getShortcuts, matchesShortcut, type ShortcutsMap } from '../../utils/shortcuts'

interface PromptInputProps {
  activeSession?: Session | null
  onSend: (
    text: string,
    options?: {
      agent?: string
      model?: { providerID: string; modelID: string }
      attachments?: PromptAttachment[]
    }
  ) => void
  onAbort: () => void
  isBusy: boolean
  placeholder?: string
  isZenMode?: boolean
}

export function PromptInput({
  activeSession,
  onSend,
  onAbort,
  isBusy,
  placeholder = 'Ask anything, / for commands, @ for context...',
  isZenMode,
}: PromptInputProps) {
  const [text, setText] = useState('')
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [commands, setCommands] = useState<CommandItem[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>('Atlas - Plan Executor')
  const [selectedModel, setSelectedModel] = useState<{ providerID: string; modelID: string }>({
    providerID: 'obsidian',
    modelID: 'grok-4.6',
  })
  const [showAgentMenu, setShowAgentMenu] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)

  // Multimodal image attachments (M4)
  const [attachments, setAttachments] = useState<PromptAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerBoxRef = useRef<HTMLDivElement>(null)

  // Configurable shortcuts from localStorage
  const [shortcuts, setShortcuts] = useState<ShortcutsMap>(getShortcuts())

  // Autocomplete Popover State (M6)
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false)
  const [popoverMode, setPopoverMode] = useState<'commands' | 'context' | null>(null)
  const [popoverQuery, setPopoverQuery] = useState<string>('')
  const [popoverSelectedIndex, setPopoverSelectedIndex] = useState<number>(0)
  const [matchingFiles, setMatchingFiles] = useState<string[]>([])

  useEffect(() => {
    const handleShortcutsUpdate = (e: Event) => {
      const custom = e as CustomEvent<ShortcutsMap>
      if (custom.detail) {
        setShortcuts(custom.detail)
      } else {
        setShortcuts(getShortcuts())
      }
    }
    window.addEventListener('shortcuts-updated', handleShortcutsUpdate)
    return () => window.removeEventListener('shortcuts-updated', handleShortcutsUpdate)
  }, [])

  // Close menus and popover on pointerdown outside container
  useEffect(() => {
    const handleClickOutside = (e: PointerEvent) => {
      if (containerBoxRef.current && !containerBoxRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
        setShowAgentMenu(false)
        setShowModelMenu(false)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [])

  const activeSessionRef = useRef(activeSession)

  // Sync selected agent and model when active session changes
  useEffect(() => {
    activeSessionRef.current = activeSession
    if (activeSession) {
      if (activeSession.agent && activeSession.agent !== 'Default Agent') {
        const rawName = activeSession.agent
        const mappedName = rawName === 'Atlas' ? 'Atlas - Plan Executor' : rawName
        const matchingAgent = agents.find((a) => a.name === mappedName)
        if (matchingAgent) {
          setSelectedAgent(matchingAgent.name)
        }
      }
      if (activeSession.model?.id) {
        setSelectedModel({
          providerID: activeSession.model.providerID || 'obsidian',
          modelID: activeSession.model.id,
        })
      }
    }
  }, [activeSession, agents])

  // Load agents, providers, commands and daemon configuration (M1 & M6)
  useEffect(() => {
    async function loadMeta() {
      try {
        const [agentList, providerList, commandList, daemonConfig] = await Promise.all([
          api.getAgents(),
          api.getProviders(),
          api.getCommands(),
          api.getConfig(),
        ])

        // Filter agents to only primary agents (M1)
        const primaryAgents = agentList.filter((a) => a.mode === 'primary')
        const usableAgents = primaryAgents.length > 0 ? primaryAgents : agentList
        setAgents(usableAgents)
        setProviders(providerList)
        setCommands(commandList)

        // Determine default agent from daemon config or first primary agent
        let defaultAgentName = 'Atlas - Plan Executor'
        if (daemonConfig.default_agent && usableAgents.some((a) => a.name === daemonConfig.default_agent)) {
          defaultAgentName = daemonConfig.default_agent
        } else {
          const atlas = usableAgents.find((a) => a.name === 'Atlas - Plan Executor' || a.name.toLowerCase().includes('atlas'))
          if (atlas) {
            defaultAgentName = atlas.name
          } else if (usableAgents.length > 0) {
            defaultAgentName = usableAgents[0].name
          }
        }

        const currentAgent = activeSessionRef.current?.agent
        if (!currentAgent || currentAgent === 'Default Agent' || currentAgent === 'Atlas') {
          setSelectedAgent(defaultAgentName)
        }

        // Initialize default model from daemon config (e.g. "obsidian/grok-4.6") or first provider
        if (daemonConfig.model && typeof daemonConfig.model === 'string' && daemonConfig.model.includes('/')) {
          const [cfgProv, cfgMod] = daemonConfig.model.split('/')
          if (cfgProv && cfgMod) {
            setSelectedModel({ providerID: cfgProv, modelID: cfgMod })
          }
        } else if (providerList.length > 0) {
          const p = providerList[0]
          const mKeys = Object.keys(p.models || {})
          if (mKeys.length > 0) {
            setSelectedModel({ providerID: p.id, modelID: mKeys[0] })
          }
        }
      } catch (err) {
        console.warn('Could not load agents/providers/config:', err)
      }
    }
    loadMeta()
  }, [])

  // Debounced file search when @ query is active (M6)
  useEffect(() => {
    if (popoverMode === 'context') {
      const timer = setTimeout(async () => {
        try {
          const files = await api.findFiles(popoverQuery || '.', activeSession?.directory)
          setMatchingFiles(files.slice(0, 15))
        } catch (err) {
          console.warn('Failed to query files for autocomplete:', err)
        }
      }, 150)
      return () => clearTimeout(timer)
    } else {
      setMatchingFiles([])
    }
  }, [popoverMode, popoverQuery, activeSession?.directory])

  // Compute matching popover items
  const popoverItems = useMemo((): PopoverItem[] => {
    if (popoverMode === 'commands') {
      return commands
        .filter(
          (c) =>
            c.name.toLowerCase().includes(popoverQuery) ||
            (c.description && c.description.toLowerCase().includes(popoverQuery))
        )
        .map((c) => ({ type: 'command', item: c }))
    }

    if (popoverMode === 'context') {
      const agentMatches: PopoverItem[] = agents
        .filter(
          (a) =>
            a.name.toLowerCase().includes(popoverQuery) ||
            (a.description && a.description.toLowerCase().includes(popoverQuery))
        )
        .map((a) => ({ type: 'agent', item: a }))

      const fileMatches: PopoverItem[] = matchingFiles.map((f) => ({
        type: 'file',
        item: f,
      }))

      return [...agentMatches, ...fileMatches]
    }

    return []
  }, [popoverMode, popoverQuery, commands, agents, matchingFiles])

  // Derive safe selectedIndex without triggering cascading setState in effect
  const safeSelectedIndex =
    popoverItems.length === 0
      ? 0
      : Math.min(Math.max(0, popoverSelectedIndex), popoverItems.length - 1)

  // Auto-grow textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
    }
  }, [text])

  // Clipboard Image Paste Handler (M4)
  const processImageFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      if (dataUrl) {
        setAttachments((prev) => [
          ...prev,
          {
            id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: file.name || 'image.png',
            mime: file.type || 'image/png',
            url: dataUrl,
          },
        ])
      }
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    let hasImage = false
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        hasImage = true
        const file = item.getAsFile()
        if (file) {
          processImageFile(file)
        }
      }
    }
    if (hasImage) {
      e.preventDefault()
    }
  }

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        processImageFile(file)
      }
    })
    e.target.value = ''
  }

  // Handle popover selection insertion
  const handleSelectPopoverItem = (entry: PopoverItem) => {
    const cursor = textareaRef.current?.selectionStart ?? text.length

    if (entry.type === 'command') {
      const afterSlash = text.startsWith('/') ? text.slice(1) : text
      const spaceIdx = afterSlash.indexOf(' ')
      const rest = spaceIdx !== -1 ? afterSlash.slice(spaceIdx).trimStart() : ''
      const newText = rest ? `/${entry.item.name} ${rest}` : `/${entry.item.name} `
      setText(newText)
      setPopoverOpen(false)
      setPopoverMode(null)
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          const pos = `/${entry.item.name} `.length
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = pos
        }
      }, 10)
      return
    }

    if (entry.type === 'agent') {
      const lastAt = text.lastIndexOf('@', cursor - 1)
      if (lastAt !== -1) {
        const beforeAt = text.slice(0, lastAt)
        const afterCursor = text.slice(cursor)
        const newText = `${beforeAt}@${entry.item.name} ${afterCursor}`
        setText(newText)
        setSelectedAgent(entry.item.name)
        setPopoverOpen(false)
        setPopoverMode(null)
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus()
            const pos = `${beforeAt}@${entry.item.name} `.length
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = pos
          }
        }, 10)
      }
      return
    }

    if (entry.type === 'file') {
      const lastAt = text.lastIndexOf('@', cursor - 1)
      if (lastAt !== -1) {
        const beforeAt = text.slice(0, lastAt)
        const afterCursor = text.slice(cursor)
        const newText = `${beforeAt}@${entry.item} ${afterCursor}`
        setText(newText)
        setPopoverOpen(false)
        setPopoverMode(null)
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus()
            const pos = `${beforeAt}@${entry.item} `.length
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = pos
          }
        }, 10)
      }
      return
    }
  }

  // Text change and autocomplete detection
  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setText(val)
    const cursor = e.target.selectionStart ?? val.length

    // Check for slash command at start of prompt
    if (val.startsWith('/')) {
      const beforeCursor = val.slice(1, cursor)
      if (!beforeCursor.includes(' ') && !beforeCursor.includes('\n')) {
        setPopoverMode('commands')
        setPopoverQuery(beforeCursor.trim().toLowerCase())
        setPopoverSelectedIndex(0)
        setPopoverOpen(true)
        return
      }
    }

    // Check for context mention (@)
    const lastAt = val.lastIndexOf('@', cursor - 1)
    if (lastAt !== -1) {
      const charBefore = lastAt > 0 ? val[lastAt - 1] : ' '
      if (/\s/.test(charBefore)) {
        const query = val.slice(lastAt + 1, cursor)
        if (!query.includes(' ') && !query.includes('\n')) {
          setPopoverMode('context')
          setPopoverQuery(query.toLowerCase())
          setPopoverSelectedIndex(0)
          setPopoverOpen(true)
          return
        }
      }
    }

    setPopoverOpen(false)
    setPopoverMode(null)
  }

  // Keyboard navigation for popover & enter submission
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (popoverOpen && popoverItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setPopoverSelectedIndex((prev) => (prev + 1) % popoverItems.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setPopoverSelectedIndex((prev) => (prev - 1 + popoverItems.length) % popoverItems.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const selected = popoverItems[safeSelectedIndex]
        if (selected) {
          handleSelectPopoverItem(selected)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setPopoverOpen(false)
        return
      }
    }

    if (matchesShortcut(e, shortcuts.sendMessage)) {
      e.preventDefault()
      handleSend()
      return
    }

    if (matchesShortcut(e, shortcuts.newLine)) {
      // Natural newline insertion in textarea
      return
    }
  }

  const handleSend = () => {
    if (isBusy) {
      onAbort()
      return
    }

    if (!text.trim() && attachments.length === 0) return

    onSend(text, {
      agent: selectedAgent,
      model: selectedModel,
      attachments,
    })

    setText('')
    setAttachments([])
    setPopoverOpen(false)
    setPopoverMode(null)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  return (
    <div
      className={
        isZenMode
          ? 'w-full select-none opacity-40 hover:opacity-100 focus-within:opacity-100 transition-all duration-300 shadow-2xl'
          : 'max-w-4xl mx-auto w-full px-4 pb-4 select-none'
      }
    >
      <div
        ref={containerBoxRef}
        className={`relative rounded-xl border shadow-2xl transition-all focus-within:border-[#388bfd]/60 focus-within:ring-1 focus-within:ring-[#388bfd]/20 ${
          isZenMode
            ? 'bg-[#121419]/90 backdrop-blur-md border-zinc-700/60 hover:border-zinc-500/80 hover:bg-[#121419]/95'
            : 'bg-[#14161b] border-[#272a31]'
        }`}
      >
        {/* Floating Autocomplete Popover (M6) */}
        <PromptPopover
          isOpen={popoverOpen}
          mode={popoverMode}
          items={popoverItems}
          selectedIndex={safeSelectedIndex}
          onSelect={handleSelectPopoverItem}
          onHoverIndex={setPopoverSelectedIndex}
        />

        {/* Thumbnail Preview Bar for Uploaded / Pasted Images (M4) */}
        {attachments.length > 0 && (
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1 overflow-x-auto no-scrollbar border-b border-zinc-800/60">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative group shrink-0 w-16 h-16 rounded-lg border border-[#2e333d] bg-[#1a1d24] overflow-hidden shadow-sm"
              >
                <img src={att.url} alt={att.name || 'image'} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                  className="absolute top-1 right-1 p-0.5 rounded-full bg-black/80 hover:bg-rose-600 text-white transition-colors"
                  title="Remove image"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Hidden File Input for Image Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Text Input Area */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={isZenMode ? '沉浸阅读中... 输入消息按 Enter 发送' : placeholder}
          className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 px-4 pt-3.5 pb-2 resize-none focus:outline-none leading-relaxed font-sans max-h-48"
        />

        {/* Bottom Control Bar */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1 text-xs">
          {/* Left selectors: Plus, Image Upload, Agent Selector, Model Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Plus Context / Image Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 rounded transition-colors"
              title="Attach image or files"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 rounded transition-colors"
              title="Upload image (supports paste from clipboard)"
            >
              <ImageIcon className="w-3.5 h-3.5 text-zinc-400 hover:text-orange-400 transition-colors" />
            </button>

            {/* Target Label */}
            <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline" title="Agent and model target for your next prompt">
              Target:
            </span>

            {/* Agent Selector Dropdown (Primary agents only, M1) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowAgentMenu(!showAgentMenu)
                  setShowModelMenu(false)
                }}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#1b1e24] hover:bg-[#22262e] border border-[#2b3038] text-zinc-300 hover:text-white transition-colors"
              >
                <Bot className="w-3 h-3 text-orange-400" />
                <span className="font-medium truncate max-w-[140px]">{selectedAgent}</span>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>

              {showAgentMenu && (
                <div className="absolute left-0 bottom-full mb-1.5 w-60 rounded-lg border border-[#2c3038] bg-[#16181e] shadow-xl z-50 p-1 max-h-56 overflow-y-auto">
                  <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase">
                    Select Primary Agent
                  </div>
                  {agents.length === 0 ? (
                    <div className="px-2 py-1 text-zinc-500 text-[11px]">No primary agents found</div>
                  ) : (
                    agents.map((agent) => (
                      <button
                        key={agent.name}
                        onClick={() => {
                          setSelectedAgent(agent.name)
                          setShowAgentMenu(false)
                          if (activeSession?.id) {
                            api.switchSessionAgent(activeSession.id, agent.name).catch(() => {})
                          }
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs flex flex-col ${
                          selectedAgent === agent.name
                            ? 'bg-orange-600/20 text-orange-300 font-medium'
                            : 'text-zinc-300 hover:bg-[#20242c]'
                        }`}
                      >
                        <span className="truncate">{agent.name}</span>
                        {agent.description && (
                          <span className="text-[10px] text-zinc-500 truncate">{agent.description}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Model Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowModelMenu(!showModelMenu)
                  setShowAgentMenu(false)
                }}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#1b1e24] hover:bg-[#22262e] border border-[#2b3038] text-zinc-300 hover:text-white transition-colors"
              >
                <Sparkles className="w-3 h-3 text-purple-400" />
                <span className="font-medium truncate max-w-[140px]">{selectedModel.modelID}</span>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>

              {showModelMenu && (
                <div className="absolute left-0 bottom-full mb-1.5 w-64 rounded-lg border border-[#2c3038] bg-[#16181e] shadow-xl z-50 p-1 max-h-56 overflow-y-auto">
                  <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase">
                    Select Model
                  </div>
                  {providers.length === 0 ? (
                    <div className="px-2 py-1 text-zinc-500 text-[11px]">Default models active</div>
                  ) : (
                    providers.flatMap((p) =>
                      Object.keys(p.models || {}).map((mKey) => {
                        const isSelected =
                          selectedModel.providerID === p.id && selectedModel.modelID === mKey
                        return (
                          <button
                            key={`${p.id}-${mKey}`}
                            onClick={() => {
                              setSelectedModel({ providerID: p.id, modelID: mKey })
                              setShowModelMenu(false)
                            }}
                            className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between ${
                              isSelected
                                ? 'bg-purple-600/20 text-purple-300 font-medium'
                                : 'text-zinc-300 hover:bg-[#20242c]'
                            }`}
                          >
                            <span className="truncate">{mKey}</span>
                            <span className="text-[10px] text-zinc-500 font-mono">{p.name || p.id}</span>
                          </button>
                        )
                      })
                    )
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Action Button (Send / Stop) */}
          <div className="flex items-center gap-2">
            {isBusy ? (
              <button
                type="button"
                onClick={onAbort}
                className="w-7 h-7 rounded-md bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition-colors shadow"
                title="Stop generation"
              >
                <Square className="w-3 h-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!text.trim() && attachments.length === 0}
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-all shadow ${
                  text.trim() || attachments.length > 0
                    ? 'bg-orange-600 hover:bg-orange-500 text-white cursor-pointer active:scale-95'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
                title="Send message (Enter)"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
