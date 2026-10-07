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
  Search,
  Check,
  Sliders,
  FileUp,
  Loader2,
} from 'lucide-react'
import type { AgentInfo, ProviderInfo, Session, CommandItem, SkillItem, Project, TodoItem } from '../../types/opencode'
import type { PromptAttachment } from '../../hooks/useChatStream'
import { api, resolveAgentName } from '../../services/api'
import { PromptPopover, type PopoverItem } from './PromptPopover'
import { ProjectDropdown } from './ProjectDropdown'
import { TodoButton } from './TodoButton'
import { getShortcuts, matchesShortcut, isIMEActive, type ShortcutsMap } from '../../utils/shortcuts'
import { isCuratedModel, isModelVisible, resolveSeniorModel } from '../../utils/model-filter'
import { usePreferences } from '../../utils/preferences'
import { useI18n } from '../../utils/i18n'
import { ManageModelsModal } from '../models/ManageModelsModal'
import { categorizeDroppedFiles, formatFileMentions, hasFilePayload } from './drag-drop'
import { ImageLightboxModal, type LightboxImage } from './ImageLightboxModal'
import { QueuedMessagesList } from './QueuedMessagesList'
import type { QueuedMessage, QueuedPromptOptions } from '../../utils/message-queue'
import { applySlashCommand, detectSlashTrigger } from './slash-trigger'
import { rankPopoverItems } from './popover-rank'

export interface DraftInjection {
  text: string
  attachments?: PromptAttachment[]
  timestamp: number
  focus?: boolean
}

export interface PromptDraft {
  text: string
  options?: QueuedPromptOptions
}

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
  /** False until the daemon answers. Neither send nor stop is honest yet. */
  runKnown?: boolean
  queuedMessages?: QueuedMessage[]
  onEnqueue?: (draft: PromptDraft) => void
  onSendQueuedNow?: (id: string) => void
  onEditQueued?: (id: string) => void
  onDeleteQueued?: (id: string) => void
  queueEditRequest?: (DraftInjection & { agent?: string; model?: { providerID: string; modelID: string } }) | null
  placeholder?: string
  isZenMode?: boolean
  draftInjection?: DraftInjection | null
  projects?: Project[]
  selectedProjectId?: string | null
  onSelectProject?: (projectId: string | null) => void
  onNewProject?: (name: string, path: string) => Promise<void> | void
  sessions?: Session[]
  todos?: TodoItem[]
}

export function PromptInput({
  activeSession,
  onSend,
  onAbort,
  isBusy,
  runKnown = true,
  queuedMessages,
  onEnqueue,
  onSendQueuedNow,
  onEditQueued,
  onDeleteQueued,
  queueEditRequest,
  placeholder = 'Ask anything, @ to mention, / for actions',
  isZenMode,
  draftInjection,
  projects,
  selectedProjectId,
  onSelectProject,
  onNewProject,
  sessions,
  todos,
}: PromptInputProps) {
  const { prefs } = usePreferences()
  const { t, lang } = useI18n()
  const isZh = lang?.startsWith('zh') ?? true
  const [text, setText] = useState('')
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [commands, setCommands] = useState<CommandItem[]>([])
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>('build')
  const [selectedModel, setSelectedModel] = useState<{ providerID: string; modelID: string; name?: string }>({
    providerID: '',
    modelID: '',
    name: '',
  })
  const seniorDefaultModelRef = useRef<{ providerID: string; modelID: string; name?: string } | null>(null)
  const [showAgentMenu, setShowAgentMenu] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [isManageModelsOpen, setIsManageModelsOpen] = useState(false)

  // Multimodal image attachments (M4) & Drag-and-Drop
  const [attachments, setAttachments] = useState<PromptAttachment[]>([])
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([])
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [processingImageCount, setProcessingImageCount] = useState<number>(0)
  const isProcessingImage = processingImageCount > 0
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerBoxRef = useRef<HTMLDivElement>(null)

  // Chinese IME Shield: composition listeners and state detection
  const isComposingRef = useRef(false)
  const lastCompositionEndTimeRef = useRef(0)

  const handleCompositionStart = () => {
    isComposingRef.current = true
  }

  const handleCompositionEnd = () => {
    isComposingRef.current = false
    lastCompositionEndTimeRef.current = Date.now()
  }

  // Configurable shortcuts from localStorage
  const [shortcuts, setShortcuts] = useState<ShortcutsMap>(getShortcuts())

  // Autocomplete Popover State (M6)
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false)
  const [popoverMode, setPopoverMode] = useState<'commands' | 'context' | null>(null)
  const [popoverQuery, setPopoverQuery] = useState<string>('')
  const [popoverSelectedIndex, setPopoverSelectedIndex] = useState<number>(0)
  const [matchingFiles, setMatchingFiles] = useState<string[]>([])

  // Handle programmatic draft injection (on revert / restore)
  const lastInjectedTimestamp = useRef<number>(0)
  useEffect(() => {
    if (!draftInjection || draftInjection.timestamp === lastInjectedTimestamp.current) return
    lastInjectedTimestamp.current = draftInjection.timestamp

    setText(draftInjection.text || '')
    if (draftInjection.attachments && draftInjection.attachments.length > 0) {
      setAttachments(draftInjection.attachments)
    } else {
      setAttachments([])
    }

    if (draftInjection.focus !== false && textareaRef.current) {
      textareaRef.current.focus()
      const len = (draftInjection.text || '').length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [draftInjection])

  const lastQueueEditTimestamp = useRef<number>(0)
  useEffect(() => {
    if (!queueEditRequest || queueEditRequest.timestamp === lastQueueEditTimestamp.current) return
    lastQueueEditTimestamp.current = queueEditRequest.timestamp
    setText(queueEditRequest.text || '')
    setAttachments(queueEditRequest.attachments || [])
    if (queueEditRequest.agent) setSelectedAgent(queueEditRequest.agent)
    if (queueEditRequest.model?.providerID && queueEditRequest.model.modelID) {
      setSelectedModel({
        providerID: queueEditRequest.model.providerID,
        modelID: queueEditRequest.model.modelID,
      })
    }
    if (textareaRef.current) {
      textareaRef.current.focus()
      const len = (queueEditRequest.text || '').length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [queueEditRequest])

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
        const canonical = resolveAgentName(activeSession.agent) || activeSession.agent
        const matchingAgent = agents.find(
          (a) => a.name === canonical || a.name.toLowerCase() === canonical.toLowerCase()
        )
        if (matchingAgent) {
          setSelectedAgent(matchingAgent.name)
        } else if (canonical) {
          setSelectedAgent(canonical)
        }
      }
      if (activeSession.model?.id) {
        const prov = activeSession.model.providerID || 'obsidian'
        const mod = activeSession.model.id
        if (isCuratedModel(prov, mod)) {
          setSelectedModel({
            providerID: prov,
            modelID: mod,
          })
        }
      } else if (seniorDefaultModelRef.current) {
        setSelectedModel(seniorDefaultModelRef.current)
      }
    }
  }, [activeSession, agents])

  // Load agents, providers, commands and daemon configuration (M1 & M6)
  useEffect(() => {
    async function loadMeta() {
      try {
        const [agentList, providerList, commandList, daemonConfig, routingConfig] = await Promise.all([
          api.getAgents(),
          api.getProviders(),
          api.getCommands(),
          api.getConfig(),
          api.getRoutingConfig(),
        ])

        // Filter selectable agents (Prometheus S1 + Refinement):
        // Exclude subagents, hidden utilities (compaction/summary/title), internal librarian, and duplicate lowercase aliases
        const aliasNames = ['prometheus', 'atlas', 'sisyphus']
        const usableAgents = agentList.filter((a) => {
          if (a.hidden) return false
          if (a.mode === 'subagent') return false
          if (a.name === 'librarian') return false
          if (aliasNames.includes(a.name.toLowerCase())) return false
          return true
        })

        // Sort order: prioritize build, plan, scout, then others
        usableAgents.sort((a, b) => {
          const priority = (name: string) => {
            if (name === 'build') return 1
            if (name === 'plan') return 2
            if (name === 'scout') return 3
            return 10
          }
          return priority(a.name) - priority(b.name)
        })

        const finalAgents = usableAgents.length > 0 ? usableAgents : agentList
        setAgents(finalAgents)
        setProviders(providerList)
        // Merge built-in commands like compaction, summary, title (Image 4)
        const defaultCommands: CommandItem[] = [
          { name: 'compaction', description: 'Compress and summarize context tokens' },
          { name: 'summary', description: 'Generate structured conversation summary' },
          { name: 'title', description: 'Auto-generate descriptive session title' },
          { name: 'undo', description: 'Revert last exchange or tool invocation' },
        ]
        const mergedCmds = [...commandList]
        for (const def of defaultCommands) {
          if (!mergedCmds.some((c) => c.name === def.name)) {
            mergedCmds.push(def)
          }
        }
        setCommands(mergedCmds)

        // Determine default agent from daemon config or first primary agent
        let defaultAgentName = 'build'
        if (daemonConfig.default_agent && finalAgents.some((a) => a.name === daemonConfig.default_agent)) {
          defaultAgentName = daemonConfig.default_agent
        } else {
          const buildAgent = finalAgents.find((a) => a.name === 'build')
          if (buildAgent) {
            defaultAgentName = buildAgent.name
          } else if (finalAgents.length > 0) {
            defaultAgentName = finalAgents[0].name
          }
        }

        const currentAgent = activeSessionRef.current?.agent
        if (!currentAgent || currentAgent === 'Default Agent' || currentAgent === 'Atlas' || currentAgent === 'Atlas - Plan Executor') {
          setSelectedAgent(defaultAgentName)
        }

        // Curated model list with display names
        const curated = providerList.flatMap((p) =>
          Object.entries(p.models || {})
            .filter(([mKey, modelObj]) => isCuratedModel(p.id, mKey, (modelObj as any)?.name))
            .map(([mKey, modelObj]) => ({
              providerID: p.id,
              modelID: mKey,
              name: (modelObj as any)?.name || (modelObj as any)?.displayName || mKey,
            }))
        )

        // Dynamically resolve Senior Model from SSOT JSON table (with daemon & priority fallbacks)
        const seniorResolved = resolveSeniorModel({
          routingConfig,
          daemonConfig,
          curatedModels: curated,
        })
        if (seniorResolved) {
          seniorDefaultModelRef.current = seniorResolved
          if (!activeSessionRef.current?.model?.id) {
            setSelectedModel(seniorResolved)
          }
        }
      } catch (err) {
        console.warn('Could not load agents/providers/config:', err)
      }
    }
    loadMeta()
  }, [])

  // Skills are scanned from SKILL.md on the companion server. Reload when the session workspace changes.
  useEffect(() => {
    let cancelled = false
    api.getSkills(activeSession?.directory).then((found) => {
      if (!cancelled) setSkills(found)
    })
    return () => {
      cancelled = true
    }
  }, [activeSession?.directory])

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

  // Active model display name (e.g. "Grok 4.6 (Paid)")
  const currentModelDisplayName = useMemo(() => {
    for (const p of providers) {
      if (p.id === selectedModel.providerID && p.models?.[selectedModel.modelID]) {
        return p.models[selectedModel.modelID].name || selectedModel.modelID
      }
    }
    return selectedModel.name || selectedModel.modelID
  }, [providers, selectedModel])

  // Grouped models for dropdown with search and visibility filtering (Image 1)
  const groupedModelsForDropdown = useMemo(() => {
    const q = modelSearchQuery.toLowerCase().trim()
    const groups: {
      providerID: string
      providerName: string
      models: { id: string; name: string }[]
    }[] = []

    providers.forEach((p) => {
      const visibleModels: { id: string; name: string }[] = []

      Object.entries(p.models || {}).forEach(([mId, mObj]) => {
        const name = mObj.name || mId
        // Check model visibility via preferences or defaults
        const visible = isModelVisible(
          p.id,
          mId,
          name,
          prefs.modelVisibility,
          prefs.providerVisibility
        )
        if (!visible) return

        // Filter by search query if present
        if (q) {
          const matchProvider = (p.name || p.id).toLowerCase().includes(q)
          const matchId = mId.toLowerCase().includes(q)
          const matchName = name.toLowerCase().includes(q)
          if (!matchProvider && !matchId && !matchName) return
        }

        visibleModels.push({
          id: mId,
          name,
        })
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
  }, [providers, modelSearchQuery, prefs.modelVisibility, prefs.providerVisibility])

  // Compute matching popover items with title-prioritized ranking
  const popoverItems = useMemo((): PopoverItem[] => {
    if (popoverMode === 'commands') {
      const allCandidates: PopoverItem[] = [
        ...commands.map((c) => ({ type: 'command' as const, item: c })),
        ...skills.map((s) => ({ type: 'skill' as const, item: s })),
      ]
      return rankPopoverItems(allCandidates, popoverQuery)
    }

    if (popoverMode === 'context') {
      const rankedAgents = rankPopoverItems(
        agents.map((a) => ({ type: 'agent' as const, item: a })),
        popoverQuery
      )

      const fileMatches: PopoverItem[] = matchingFiles.map((f) => ({
        type: 'file',
        item: f,
      }))

      return [...rankedAgents, ...fileMatches]
    }

    return []
  }, [popoverMode, popoverQuery, commands, skills, agents, matchingFiles])

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
    setProcessingImageCount((prev) => prev + 1)
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
      setProcessingImageCount((prev) => Math.max(0, prev - 1))
    }
    reader.onerror = (err) => {
      console.error('FileReader error reading image attachment:', err)
      setProcessingImageCount((prev) => Math.max(0, prev - 1))
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

  // Drag and Drop Attachment / Mention Handlers
  const handleDragEnter = (e: React.DragEvent) => {
    if (!hasFilePayload(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (dragCounterRef.current === 1) {
      setIsDragging(true)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!hasFilePayload(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!hasFilePayload(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    if (!hasFilePayload(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)

    const rawFiles = e.dataTransfer.files
    if (!rawFiles || rawFiles.length === 0) return

    const { imageFiles, otherFiles } = categorizeDroppedFiles(rawFiles)

    // 1. Process image files into thumbnail attachments
    imageFiles.forEach((imgFile) => {
      processImageFile(imgFile)
    })

    // 2. Process other files (logs, code, docs) into @file mentions
    if (otherFiles.length > 0) {
      const cursor = textareaRef.current?.selectionStart ?? text.length
      const { newText, newCursorPosition } = formatFileMentions(otherFiles, text, cursor)
      setText(newText)

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = newCursorPosition
        }
      }, 10)
    }
  }

  // Handle popover selection insertion
  const handleSelectPopoverItem = (entry: PopoverItem) => {
    const cursor = textareaRef.current?.selectionStart ?? text.length

    if (entry.type === 'command' || entry.type === 'skill') {
      const applied = applySlashCommand(text, cursor, entry.item.name)
      if (!applied) {
        setPopoverOpen(false)
        setPopoverMode(null)
        return
      }
      setText(applied.text)
      setPopoverOpen(false)
      setPopoverMode(null)
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = applied.cursor
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

    // Slash menu: start of field, or `/` after whitespace. A `/` inside a word stays text.
    const slash = detectSlashTrigger(val, cursor)
    if (slash) {
      setPopoverMode('commands')
      setPopoverQuery(slash.query.trim().toLowerCase())
      setPopoverSelectedIndex(0)
      setPopoverOpen(true)
      return
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
    // Chinese IME Shield: completely bypass shortcut evaluation & submission during IME composition or candidate confirmation cooldown
    if (isIMEActive(e, isComposingRef.current, lastCompositionEndTimeRef.current, 60)) {
      return
    }

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

  const clearComposer = () => {
    setText('')
    setAttachments([])
    setPopoverOpen(false)
    setPopoverMode(null)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleSend = () => {
    if (isProcessingImage) {
      return
    }

    if (!text.trim() && attachments.length === 0) {
      return
    }

    const draft: PromptDraft = {
      text,
      options: {
        agent: selectedAgent,
        model: selectedModel,
        attachments,
      },
    }

    // While the model is working, Enter queues instead of aborting.
    // The red stop button remains the only abort control.
    if (isBusy && onEnqueue) {
      onEnqueue(draft)
      clearComposer()
      return
    }

    if (isBusy) {
      onAbort()
      return
    }

    onSend(draft.text, draft.options)
    clearComposer()
  }

  return (
    <div
      className={
        isZenMode
          ? 'w-full select-none opacity-40 hover:opacity-100 focus-within:opacity-100 transition-all duration-300 shadow-2xl'
          : `mx-auto w-full px-4 sm:px-6 lg:px-8 pb-4 select-none ${
              prefs.conversationWidth === 'narrow'
                ? 'max-w-2xl'
                : prefs.conversationWidth === 'wide'
                ? 'max-w-6xl'
                : 'max-w-4xl xl:max-w-5xl'
            }`
      }
    >
      {queuedMessages && queuedMessages.length > 0 && onSendQueuedNow && onEditQueued && onDeleteQueued && (
        <QueuedMessagesList
          items={queuedMessages}
          onSendNow={onSendQueuedNow}
          onEdit={onEditQueued}
          onDelete={onDeleteQueued}
        />
      )}

      {/* Project Selector Pill directly above prompt input (Image 2) */}
      {!isZenMode && (
        <div className="flex items-center justify-between mb-1.5 px-0">
          <div className="flex items-center gap-1.5">
            <ProjectDropdown
              projects={projects || []}
              selectedProjectId={selectedProjectId || null}
              sessions={sessions || []}
              onSelectProject={onSelectProject || (() => {})}
              onNewProject={onNewProject}
              onQuickStart={() => {
                setText('快速分析当前代码库与架构')
                textareaRef.current?.focus()
              }}
            />
            {todos && todos.length > 0 && <TodoButton todos={todos} />}
          </div>
        </div>
      )}

      <div
        ref={containerBoxRef}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-xl border shadow-2xl transition-all focus-within:border-[#388bfd]/60 focus-within:ring-1 focus-within:ring-[#388bfd]/20 ${
          isDragging
            ? 'border-orange-500/80 ring-2 ring-orange-500/30 bg-[#161922]'
            : isZenMode
            ? 'bg-[#121419]/90 backdrop-blur-md border-zinc-700/60 hover:border-zinc-500/80 hover:bg-[#121419]/95'
            : 'bg-[#14161b] border-[#272a31]'
        }`}
      >
        {/* Drag and Drop Active Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-[#12141a]/95 backdrop-blur-xs border-2 border-dashed border-orange-500/80 pointer-events-none select-none transition-all">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1a1e27] border border-orange-500/50 text-orange-300 text-xs font-medium shadow-2xl animate-in zoom-in-95 duration-100">
              <FileUp className="w-4 h-4 text-orange-400 animate-bounce" />
              <span>{isZh ? '释放以注入图片预览缩略图或 @文件引用' : 'Drop to inject images or @file mentions'}</span>
            </div>
          </div>
        )}
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
            {attachments.map((att, idx) => (
              <div
                key={att.id}
                className="relative group shrink-0 w-16 h-16 rounded-xl border border-[#2e333d] bg-[#1a1d24] overflow-hidden shadow-sm hover:border-purple-500/80 transition-all cursor-pointer"
                onClick={() => {
                  setLightboxImages(attachments.map((a) => ({ id: a.id, url: a.url, filename: a.name })))
                  setLightboxIndex(idx)
                  setIsLightboxOpen(true)
                }}
              >
                <img
                  src={att.url}
                  alt={att.name || 'image'}
                  className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                  title={att.name || '点击查看大图'}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setAttachments((prev) => prev.filter((a) => a.id !== att.id))
                  }}
                  className="absolute top-1 right-1 p-0.5 rounded-full bg-black/80 hover:bg-rose-600 text-white transition-colors cursor-pointer"
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
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
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

            {/* Model Selector Dropdown (Image 1) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowModelMenu(!showModelMenu)
                  setShowAgentMenu(false)
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#181b22] hover:bg-[#20242e] border border-[#2b303a] text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Select model"
              >
                <Sparkles className="w-3 h-3 text-purple-400" />
                <span className="font-medium truncate max-w-[150px]">
                  {currentModelDisplayName}
                </span>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>

              {showModelMenu && (
                <div className="absolute left-0 bottom-full mb-2 w-72 rounded-xl border border-[#2a2e38] bg-[#14161c] shadow-2xl z-50 overflow-hidden flex flex-col">
                  {/* Search Box at top (Matches Image 1) */}
                  <div className="p-2 border-b border-[#21242b] bg-[#111317]">
                    <div className="relative flex items-center">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 text-zinc-500 pointer-events-none" />
                      <input
                        type="text"
                        value={modelSearchQuery}
                        onChange={(e) => setModelSearchQuery(e.target.value)}
                        placeholder={t.models.searchPlaceholder}
                        autoFocus
                        className="w-full pl-8 pr-2.5 py-1 bg-[#0c0d10] border border-[#272a32] focus:border-purple-500/80 focus:ring-1 focus:ring-purple-500/30 rounded-md text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none transition-all"
                      />
                      {modelSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setModelSearchQuery('')}
                          className="absolute right-2 text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Grouped Model List by Provider (Matches Image 1) */}
                  <div className="p-1 max-h-64 overflow-y-auto space-y-2">
                    {groupedModelsForDropdown.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-zinc-500">
                        {t.models.noModelsFound}
                      </div>
                    ) : (
                      groupedModelsForDropdown.map((group) => (
                        <div key={group.providerID} className="space-y-0.5">
                          <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                            {group.providerName}
                          </div>
                          {group.models.map((m) => {
                            const isSelected =
                              selectedModel.providerID === group.providerID &&
                              selectedModel.modelID === m.id

                            return (
                              <button
                                key={`${group.providerID}-${m.id}`}
                                onClick={() => {
                                  setSelectedModel({
                                    providerID: group.providerID,
                                    modelID: m.id,
                                    name: m.name,
                                  })
                                  setShowModelMenu(false)
                                  setModelSearchQuery('')
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

                  {/* Manage Models Action Button at Bottom (Matches Image 1) */}
                  <div className="p-1 border-t border-[#21242b] bg-[#111317]">
                    <button
                      type="button"
                      onClick={() => {
                        setShowModelMenu(false)
                        setIsManageModelsOpen(true)
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center gap-2 text-zinc-400 hover:text-white hover:bg-[#1e222a] transition-colors cursor-pointer font-medium"
                    >
                      <Sliders className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{t.models.manageBtn}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Action Button (Send / Stop) */}
          <div className="flex items-center gap-2">
            {!runKnown ? (
              <button
                type="button"
                disabled
                className="w-7 h-7 rounded-md bg-zinc-800 text-zinc-400 flex items-center justify-center cursor-wait"
                title={isZh ? '正在确认状态…' : 'Checking status…'}
                aria-label={isZh ? '正在确认状态' : 'Checking status'}
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </button>
            ) : isBusy ? (
              <>
                {(text.trim() || attachments.length > 0) && (
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={isProcessingImage}
                    className="w-7 h-7 rounded-md bg-orange-600 hover:bg-orange-500 text-white flex items-center justify-center transition-all shadow cursor-pointer active:scale-95"
                    title={isZh ? '加入队列 (Enter)' : 'Queue message (Enter)'}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onAbort}
                  className="w-7 h-7 rounded-md bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition-colors shadow"
                  title="Stop generation"
                >
                  <Square className="w-3 h-3 fill-current" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={(!text.trim() && attachments.length === 0) || isProcessingImage}
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-all shadow ${
                  (text.trim() || attachments.length > 0) && !isProcessingImage
                    ? 'bg-orange-600 hover:bg-orange-500 text-white cursor-pointer active:scale-95'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
                title={isProcessingImage ? 'Processing image...' : 'Send message (Enter)'}
              >
                {isProcessingImage ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Manage Models Modal Dialog (Matches Image 2) */}
      <ManageModelsModal
        isOpen={isManageModelsOpen}
        onClose={() => setIsManageModelsOpen(false)}
        providers={providers}
      />

      {/* Floating Image Lightbox Modal */}
      {isLightboxOpen && (
        <ImageLightboxModal
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
          images={lightboxImages}
          initialIndex={lightboxIndex}
        />
      )}
    </div>
  )
}
