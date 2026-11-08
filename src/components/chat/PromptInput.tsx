import { useState, useEffect, useRef, useMemo, type ChangeEvent, type KeyboardEvent, type ClipboardEvent } from 'react'
import {
  Plus,
  ArrowRight,
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
  HelpCircle,
} from 'lucide-react'
import type { AgentInfo, ProviderInfo, Session, CommandItem, SkillItem, Project, TodoItem } from '../../types/opencode'
import type { PromptAttachment } from '../../hooks/useChatStream'
import { api, resolveAgentName } from '../../services/api'
import { PromptPopover, type PopoverItem } from './PromptPopover'
import { ProjectDropdown } from './ProjectDropdown'
import { TodoButton } from './TodoButton'
import { getShortcuts, matchesShortcut, isIMEActive, type ShortcutsMap } from '../../utils/shortcuts'
import { isCuratedModel, resolveSeniorModel } from '../../utils/model-filter'
import {
  applyAtMentionInsertion,
  buildGroupedModelsForDropdown,
  filterAndSortSelectableAgents,
  mergeBuiltinCommands,
} from './prompt-input-helpers'
import { usePreferences } from '../../utils/preferences'
import { useI18n } from '../../utils/i18n'
import { ManageModelsModal } from '../models/ManageModelsModal'
import { categorizeDroppedFiles, formatFileMentions, hasFilePayload } from './drag-drop'
import { ImageLightboxModal, type LightboxImage } from './ImageLightboxModal'
import { PastedSnippetCard } from './PastedSnippetCard'
import { PastedContentModal } from './PastedContentModal'
import {
  shouldConvertToPastedSnippet,
  createPastedAttachment,
  isPastedAttachment,
  isImageAttachment,
} from '../../utils/pasted-snippets'
import { QueuedMessagesList } from './QueuedMessagesList'
import { shouldEnqueueSubmission, type QueuedMessage, type QueuedPromptOptions } from '../../utils/message-queue'
import { applySlashCommand, detectSlashTrigger } from './slash-trigger'
import { rankPopoverItems } from './popover-rank'
import {
  getStoredPromptDraft,
  saveStoredPromptDraft,
  clearStoredPromptDraft,
} from '../../utils/prompt-draft'
import { resolvePromptWithConversationMentions } from '../../utils/conversation-mention'
import { SlashCommandGuide } from './SlashCommandGuide'
import {
  parseSlashCommandInput,
  formatSlashCommandPrompt,
} from '../../utils/slash-commands'

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
  activeSessionId?: string | null
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
  isQueuePaused?: boolean
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
  onSideQuestion?: (question: string) => void
  sideQuestionCount?: number
  onToggleSideQuestion?: () => void
  onSelectModel?: (model: { providerID: string; modelID: string; name?: string }) => void
  onSelectAgent?: (agentName: string) => void
}

export function PromptInput({
  activeSessionId,
  activeSession,
  onSend,
  onAbort,
  isBusy,
  runKnown = true,
  queuedMessages,
  isQueuePaused,
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
  onSideQuestion,
  sideQuestionCount = 0,
  onToggleSideQuestion,
  onSelectModel,
  onSelectAgent,
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
  const selectedModelRef = useRef(selectedModel)
  const selectedAgentRef = useRef(selectedAgent)
  useEffect(() => {
    selectedModelRef.current = selectedModel
  }, [selectedModel])
  useEffect(() => {
    selectedAgentRef.current = selectedAgent
  }, [selectedAgent])
  const [showAgentMenu, setShowAgentMenu] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [isManageModelsOpen, setIsManageModelsOpen] = useState(false)

  // Multimodal image attachments (M4), Pasted Snippets (p1, p2) & Drag-and-Drop
  const [attachments, setAttachments] = useState<PromptAttachment[]>([])
  const [activePastedModal, setActivePastedModal] = useState<{
    attachmentId: string
    editMode: boolean
  } | null>(null)
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

  // Session draft autosave & persistence (5s interval + debounced save + window flush)
  const currentSessionId = activeSessionId || activeSession?.id || '__draft__'
  const [isDraftSaved, setIsDraftSaved] = useState(false)
  const textRef = useRef(text)
  const attachmentsRef = useRef(attachments)
  const currentSessionIdRef = useRef(currentSessionId)
  const prevSessionIdRef = useRef<string | null>(null)
  const isInitialDraftLoadedRef = useRef(false)

  // Keep live refs synced
  useEffect(() => {
    textRef.current = text
    attachmentsRef.current = attachments
    currentSessionIdRef.current = currentSessionId
  }, [text, attachments, currentSessionId])

  // Restore draft when session changes (or on initial mount)
  useEffect(() => {
    // If switching between sessions after initial load, flush outgoing draft first
    if (
      isInitialDraftLoadedRef.current &&
      prevSessionIdRef.current &&
      prevSessionIdRef.current !== currentSessionId
    ) {
      saveStoredPromptDraft(prevSessionIdRef.current, {
        text: textRef.current,
        attachments: attachmentsRef.current,
        model: selectedModelRef.current.modelID ? selectedModelRef.current : undefined,
        agent: selectedAgentRef.current,
      })
    }

    const stored = getStoredPromptDraft(currentSessionId)
    if (stored) {
      setText(stored.text)
      setAttachments(stored.attachments || [])
      setIsDraftSaved(Boolean(stored.text.trim() || (stored.attachments && stored.attachments.length > 0)))
      if (stored.agent) {
        const canonical = resolveAgentName(stored.agent) || stored.agent
        setSelectedAgent(canonical)
      }
      if (stored.model?.modelID && isCuratedModel(stored.model.providerID, stored.model.modelID)) {
        setSelectedModel(stored.model)
      }
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
        }
      })
    } else if (isInitialDraftLoadedRef.current) {
      setText('')
      setAttachments([])
      setIsDraftSaved(false)
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }

    prevSessionIdRef.current = currentSessionId
    isInitialDraftLoadedRef.current = true
  }, [currentSessionId])

  // Periodic autosave loop: saves every 5 seconds continuously while editing
  useEffect(() => {
    const autosaveTimer = setInterval(() => {
      const sid = currentSessionIdRef.current
      const curText = textRef.current
      const curAtts = attachmentsRef.current
      const curModel = selectedModelRef.current.modelID ? selectedModelRef.current : undefined
      const curAgent = selectedAgentRef.current
      if (curText.trim() || (curAtts && curAtts.length > 0) || curModel) {
        saveStoredPromptDraft(sid, {
          text: curText,
          attachments: curAtts,
          model: curModel,
          agent: curAgent,
        })
        setIsDraftSaved(Boolean(curText.trim() || (curAtts && curAtts.length > 0)))
      } else {
        clearStoredPromptDraft(sid)
        setIsDraftSaved(false)
      }
    }, 5000)

    return () => clearInterval(autosaveTimer)
  }, [])

  // Debounced autosave (1s) after typing or attachment change
  useEffect(() => {
    if (!isInitialDraftLoadedRef.current) return

    const debounceTimer = setTimeout(() => {
      const sid = currentSessionIdRef.current
      const curModel = selectedModelRef.current.modelID ? selectedModelRef.current : undefined
      const curAgent = selectedAgentRef.current
      if (text.trim() || attachments.length > 0 || curModel) {
        saveStoredPromptDraft(sid, {
          text,
          attachments,
          model: curModel,
          agent: curAgent,
        })
        setIsDraftSaved(Boolean(text.trim() || attachments.length > 0))
      } else {
        clearStoredPromptDraft(sid)
        setIsDraftSaved(false)
      }
    }, 1000)

    return () => clearTimeout(debounceTimer)
  }, [text, attachments])

  // Synchronous flush before page unload / F5 refresh / tab close
  useEffect(() => {
    const flushDraft = () => {
      const sid = currentSessionIdRef.current
      const curText = textRef.current
      const curAtts = attachmentsRef.current
      const curModel = selectedModelRef.current.modelID ? selectedModelRef.current : undefined
      const curAgent = selectedAgentRef.current
      if (curText.trim() || (curAtts && curAtts.length > 0) || curModel) {
        saveStoredPromptDraft(sid, {
          text: curText,
          attachments: curAtts,
          model: curModel,
          agent: curAgent,
        })
      } else {
        clearStoredPromptDraft(sid)
      }
    }

    window.addEventListener('beforeunload', flushDraft)
    window.addEventListener('pagehide', flushDraft)
    return () => {
      window.removeEventListener('beforeunload', flushDraft)
      window.removeEventListener('pagehide', flushDraft)
      flushDraft()
    }
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
      } else {
        const draft = getStoredPromptDraft(activeSession.id)
        if (draft?.model?.modelID && isCuratedModel(draft.model.providerID, draft.model.modelID)) {
          setSelectedModel(draft.model)
        } else if (seniorDefaultModelRef.current) {
          setSelectedModel(seniorDefaultModelRef.current)
        }
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

        const { finalAgents, defaultAgentName } = filterAndSortSelectableAgents(
          agentList,
          daemonConfig.default_agent
        )
        setAgents(finalAgents)
        setProviders(providerList)
        setCommands(mergeBuiltinCommands(commandList))

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
  const groupedModelsForDropdown = useMemo(
    () =>
      buildGroupedModelsForDropdown(
        providers,
        modelSearchQuery,
        prefs.modelVisibility,
        prefs.providerVisibility
      ),
    [providers, modelSearchQuery, prefs.modelVisibility, prefs.providerVisibility]
  )

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

      // Historical conversations matching popoverQuery (or top recent sessions on empty @)
      const sessionList = sessions || []
      const rankedSessions = rankPopoverItems(
        sessionList.map((s) => ({ type: 'conversation' as const, item: s })),
        popoverQuery
      )
      const topSessions = rankedSessions.slice(0, 8)

      const fileMatches: PopoverItem[] = matchingFiles.map((f) => ({
        type: 'file',
        item: f,
      }))

      return [...rankedAgents, ...topSessions, ...fileMatches]
    }

    return []
  }, [popoverMode, popoverQuery, commands, skills, agents, sessions, matchingFiles])

  // Derive safe selectedIndex without triggering cascading setState in effect
  const safeSelectedIndex =
    popoverItems.length === 0
      ? 0
      : Math.min(Math.max(0, popoverSelectedIndex), popoverItems.length - 1)

  // Active slash command guidance state
  const activeSlashCommand = useMemo(() => {
    return parseSlashCommandInput(text)
  }, [text])

  const handleSelectSlashPreset = (presetValue: string) => {
    if (!activeSlashCommand?.definition) return
    const cmdName = activeSlashCommand.definition.name
    const newText = `/${cmdName} ${presetValue}`
    setText(newText)
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = newText.length
      }
    }, 10)
  }

  const handleClearSlashCommand = () => {
    setText('')
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

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
    if (items) {
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
        return
      }
    }

    const pastedText = e.clipboardData?.getData('text/plain') || ''
    if (shouldConvertToPastedSnippet(pastedText)) {
      e.preventDefault()
      setAttachments((prev) => [...prev, createPastedAttachment(pastedText, prev)])
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

    if (entry.type === 'conversation') {
      const mentionTarget = `conversation:${entry.item.id}`
      const inserted = applyAtMentionInsertion(text, cursor, mentionTarget)
      if (inserted) {
        setText(inserted.newText)
        setPopoverOpen(false)
        setPopoverMode(null)
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus()
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = inserted.newCursor
          }
        }, 10)
      }
      return
    }

    if (entry.type === 'agent' || entry.type === 'file') {
      const mentionTarget = entry.type === 'agent' ? entry.item.name : entry.item
      const inserted = applyAtMentionInsertion(text, cursor, mentionTarget)
      if (inserted) {
        setText(inserted.newText)
        if (entry.type === 'agent') {
          setSelectedAgent(entry.item.name)
        }
        setPopoverOpen(false)
        setPopoverMode(null)
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus()
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = inserted.newCursor
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
    const sid = currentSessionIdRef.current
    clearStoredPromptDraft(sid)
    setIsDraftSaved(false)
    setText('')
    setAttachments([])
    setPopoverOpen(false)
    setPopoverMode(null)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleSend = async () => {
    if (isProcessingImage) {
      return
    }

    if (!text.trim() && attachments.length === 0) {
      return
    }

    // Slash Command Directive State Machine
    const slashResult = formatSlashCommandPrompt(text)
    if (slashResult.isSpecialExecution) {
      if (slashResult.specialKind === 'compact') {
        if (activeSessionId) {
          window.dispatchEvent(
            new CustomEvent('opencode:toast', {
              detail: { message: '正在调用官方原版后端压缩会话上下文 (Summarizing session…)' },
            })
          )
          void api.compactSession(activeSessionId, selectedModel).catch((err) => {
            console.error('[PromptInput] Compact session failed:', err)
            window.dispatchEvent(
              new CustomEvent('opencode:toast', {
                detail: { message: '压缩会话失败，请检查模型连接或后端状态' },
              })
            )
          })
        }
        clearComposer()
        return
      }

      if (slashResult.specialKind === 'btw') {
        const question = slashResult.formattedText || text.replace(/^\/btw\s*/, '').trim()
        if (question) {
          if (onSideQuestion) {
            onSideQuestion(question)
          } else {
            onSend(question, { agent: selectedAgent, model: selectedModel, attachments })
          }
          clearComposer()
          return
        }
      }

      if (slashResult.specialKind === 'undo') {
        if (onAbort) {
          onAbort()
        }
        clearComposer()
        return
      }
    }

    // Auto-switch suggested agent if command requests it (e.g. /plan -> plan, /goal -> build)
    let agentToSend = selectedAgent
    if (slashResult.suggestedAgent && agents.some((a) => a.name === slashResult.suggestedAgent)) {
      agentToSend = slashResult.suggestedAgent
      setSelectedAgent(slashResult.suggestedAgent)
    }

    let textToSend = slashResult.formattedText || text

    // Resolve @conversation mentions: mount referenced historical conversation context into prompt payload
    if (textToSend.includes('@conversation')) {
      try {
        const { resolvedText } = await resolvePromptWithConversationMentions(
          textToSend,
          sessions || [],
          (sid) => api.getMessages(sid)
        )
        textToSend = resolvedText
      } catch (err) {
        console.warn('[PromptInput] Failed to resolve conversation mentions:', err)
      }
    }

    const draft: PromptDraft = {
      text: textToSend,
      options: {
        agent: agentToSend,
        model: selectedModel,
        attachments,
      },
    }

    // While the model is working OR when items are already waiting in the queue,
    // Enter / Send appends to the FIFO queue so new messages never cut in line.
    const queueCount = queuedMessages ? queuedMessages.length : 0
    if (shouldEnqueueSubmission(isBusy, queueCount) && onEnqueue) {
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
          isPaused={isQueuePaused}
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
        className={`relative rounded-2xl border shadow-2xl transition-all focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-sky-500/20 ${
          isDragging
            ? 'border-sky-500/80 ring-2 ring-sky-500/30 bg-[#161924]'
            : isZenMode
            ? 'bg-[#181824]/95 backdrop-blur-md border-[#2b2b3f] hover:border-zinc-700'
            : 'bg-[#181824]/95 backdrop-blur-md border-[#262638] hover:border-zinc-700'
        }`}
      >
        {/* Drag and Drop Active Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-[#12141a]/95 backdrop-blur-xs border-2 border-dashed border-sky-500/80 pointer-events-none select-none transition-all">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1a1e27] border border-sky-500/50 text-sky-300 text-xs font-medium shadow-2xl animate-in zoom-in-95 duration-100">
              <FileUp className="w-4 h-4 text-sky-400 animate-bounce" />
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

        {/* Interactive Slash Command Guidance Bar */}
        {activeSlashCommand?.definition && !popoverOpen && (
          <SlashCommandGuide
            definition={activeSlashCommand.definition}
            args={activeSlashCommand.args}
            onSelectPreset={handleSelectSlashPreset}
            onClearCommand={handleClearSlashCommand}
            isZh={isZh}
          />
        )}

        {/* Thumbnail & Pasted Card Preview Bar (M4 + Claude Pasted Snippets p1, p2) */}
        {attachments.length > 0 && (
          <div className="flex items-center gap-2.5 px-3 pt-3 pb-1.5 overflow-x-auto no-scrollbar border-b border-zinc-800/60">
            {attachments.map((att) => {
              if (isPastedAttachment(att)) {
                return (
                  <PastedSnippetCard
                    key={att.id || att.pastedId}
                    pastedId={att.pastedId || att.name || 'p1'}
                    content={att.content || ''}
                    onClick={() =>
                      setActivePastedModal({
                        attachmentId: att.id || att.pastedId || 'p1',
                        editMode: false,
                      })
                    }
                    onEdit={() =>
                      setActivePastedModal({
                        attachmentId: att.id || att.pastedId || 'p1',
                        editMode: true,
                      })
                    }
                    onRemove={() =>
                      setAttachments((prev) =>
                        prev.filter((a) => (a.id || a.pastedId) !== (att.id || att.pastedId))
                      )
                    }
                  />
                )
              }

              return (
                <div
                  key={att.id}
                  className="relative group shrink-0 w-16 h-16 rounded-xl border border-[#2e333d] bg-[#1a1d24] overflow-hidden shadow-sm hover:border-sky-500/80 transition-all cursor-pointer"
                  onClick={() => {
                    const imgAtts = attachments.filter(isImageAttachment)
                    const imgIdx = Math.max(
                      0,
                      imgAtts.findIndex((a) => a.id === att.id)
                    )
                    setLightboxImages(imgAtts.map((a) => ({ id: a.id, url: a.url, filename: a.name })))
                    setLightboxIndex(imgIdx)
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
              )
            })}
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
          placeholder={isZenMode ? '沉浸阅读中... 输入消息按 Enter 发送' : (placeholder || 'Ask anything, @ to mention, / for actions')}
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
              <ImageIcon className="w-3.5 h-3.5 text-zinc-400 hover:text-sky-400 transition-colors" />
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
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1c1d27] hover:bg-[#242533] border border-zinc-800 text-zinc-300 hover:text-white transition-colors text-xs"
              >
                <Bot className="w-3 h-3 text-zinc-400" />
                <span className="font-medium truncate max-w-[140px]">{selectedAgent}</span>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>

              {showAgentMenu && (
                <div className="absolute left-0 bottom-full mb-1.5 w-60 rounded-xl border border-zinc-800 bg-[#161622] shadow-xl z-50 p-1 max-h-56 overflow-y-auto">
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
                          selectedAgentRef.current = agent.name
                          setShowAgentMenu(false)
                          onSelectAgent?.(agent.name)
                          if (activeSession?.id) {
                            api.switchSessionAgent(activeSession.id, agent.name).catch(() => {})
                          }
                          saveStoredPromptDraft(currentSessionIdRef.current, {
                            text: textRef.current,
                            attachments: attachmentsRef.current,
                            model: selectedModelRef.current.modelID ? selectedModelRef.current : undefined,
                            agent: agent.name,
                          })
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs flex flex-col ${
                          selectedAgent === agent.name
                            ? 'bg-zinc-800 text-sky-300 font-medium'
                            : 'text-zinc-300 hover:bg-[#222234]'
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
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1c1d27] hover:bg-[#242533] border border-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer text-xs"
                title="Select model"
              >
                <Sparkles className="w-3 h-3 text-zinc-400" />
                <span className="font-medium truncate max-w-[150px]">
                  {currentModelDisplayName}
                </span>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>

              {showModelMenu && (
                <div className="absolute left-0 bottom-full mb-2 w-72 rounded-xl border border-zinc-800 bg-[#161622] shadow-2xl z-50 overflow-hidden flex flex-col">
                  {/* Search Box at top (Matches Image 1) */}
                  <div className="p-2 border-b border-[#242436] bg-[#12121a]">
                    <div className="relative flex items-center">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 text-zinc-500 pointer-events-none" />
                      <input
                        type="text"
                        value={modelSearchQuery}
                        onChange={(e) => setModelSearchQuery(e.target.value)}
                        placeholder={t.models.searchPlaceholder}
                        autoFocus
                        className="w-full pl-8 pr-2.5 py-1 bg-[#0f0f15] border border-[#242436] focus:border-sky-500/80 focus:ring-1 focus:ring-sky-500/30 rounded-md text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none transition-all"
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
                                  const nextModel = {
                                    providerID: group.providerID,
                                    modelID: m.id,
                                    name: m.name,
                                  }
                                  setSelectedModel(nextModel)
                                  selectedModelRef.current = nextModel
                                  setShowModelMenu(false)
                                  setModelSearchQuery('')
                                  onSelectModel?.(nextModel)
                                  saveStoredPromptDraft(currentSessionIdRef.current, {
                                    text: textRef.current,
                                    attachments: attachmentsRef.current,
                                    model: nextModel,
                                    agent: selectedAgentRef.current,
                                  })
                                }}
                                className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-zinc-800 text-sky-300 font-medium'
                                    : 'text-zinc-300 hover:bg-[#1e222a]'
                                }`}
                              >
                                <span className="truncate pr-2">{m.name || m.id}</span>
                                {isSelected && (
                                  <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />
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

            {/* Side Question Pill Button (Image 2) */}
            {sideQuestionCount > 0 && (
              <button
                type="button"
                onClick={onToggleSideQuestion}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1a1d24] hover:bg-[#232731] border border-sky-500/30 text-sky-200 text-xs transition-colors cursor-pointer group shadow-sm select-none"
                title={
                  isZh
                    ? `查看 ${sideQuestionCount} 个侧边提问 (View ${sideQuestionCount} side question${sideQuestionCount > 1 ? 's' : ''})`
                    : `View ${sideQuestionCount} side question${sideQuestionCount > 1 ? 's' : ''}`
                }
              >
                <HelpCircle className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
                <span className="font-medium text-[11px]">
                  {sideQuestionCount} Side Question{sideQuestionCount > 1 ? 's' : ''}
                </span>
              </button>
            )}
          </div>

          {/* Right Action Button (Send / Stop) */}
          <div className="flex items-center gap-2">
            {/* Subtle Draft Autosave indicator */}
            {isDraftSaved && (text.trim() || attachments.length > 0) && (
              <span
                className="hidden sm:inline-flex items-center gap-1 text-[11px] text-zinc-500 font-mono select-none px-1.5 py-0.5 rounded bg-zinc-900/60 border border-zinc-800/50"
                title={isZh ? '草稿每5秒自动保存至本地，刷新或关闭不会丢失' : 'Draft autosaves every 5s, will not be lost on reload'}
              >
                <Check className="w-2.5 h-2.5 text-emerald-500" />
                <span>{isZh ? '草稿已保存' : 'Draft saved'}</span>
              </span>
            )}
            {!runKnown ? (
              <button
                type="button"
                disabled
                className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center cursor-wait"
                title={isZh ? '正在确认状态…' : 'Checking status…'}
                aria-label={isZh ? '正在确认状态' : 'Checking status'}
              >
                <Loader2 className="w-4 h-4 animate-spin" />
              </button>
            ) : isBusy ? (
              <>
                {(text.trim() || attachments.length > 0) && (
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={isProcessingImage}
                    className="w-8 h-8 rounded-full bg-sky-500 hover:bg-sky-400 text-white flex items-center justify-center transition-all shadow-md shadow-sky-500/20 cursor-pointer active:scale-95"
                    title={isZh ? '加入队列 (Enter)' : 'Queue message (Enter)'}
                  >
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onAbort}
                  className="w-8 h-8 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition-colors shadow cursor-pointer active:scale-95"
                  title="Stop generation"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={(!text.trim() && attachments.length === 0) || isProcessingImage}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow ${
                  (text.trim() || attachments.length > 0) && !isProcessingImage
                    ? 'bg-sky-500 hover:bg-sky-400 text-white cursor-pointer active:scale-95 shadow-md shadow-sky-500/20'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
                title={isProcessingImage ? 'Processing image...' : 'Send message (Enter)'}
              >
                {isProcessingImage ? (
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                ) : (
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
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

      {/* Floating Pasted Content Modal (Image 3 FileViewModal style) */}
      {(() => {
        if (!activePastedModal) return null
        const targetAtt = attachments.find(
          (a) => (a.id || a.pastedId) === activePastedModal.attachmentId
        )
        if (!targetAtt) return null
        const pid = targetAtt.pastedId || targetAtt.name || 'p1'
        return (
          <PastedContentModal
            isOpen={true}
            pastedId={pid}
            content={targetAtt.content || ''}
            initialEditMode={activePastedModal.editMode}
            onClose={() => setActivePastedModal(null)}
            onSaveContent={(newContent) => {
              setAttachments((prev) =>
                prev.map((a) =>
                  (a.id || a.pastedId) === activePastedModal.attachmentId
                    ? { ...a, content: newContent }
                    : a
                )
              )
            }}
            onInlineToInput={() => {
              const snippetText = targetAtt.content || ''
              setText((prev) => (prev.trim() ? `${prev}\n${snippetText}` : snippetText))
              setAttachments((prev) =>
                prev.filter((a) => (a.id || a.pastedId) !== activePastedModal.attachmentId)
              )
            }}
          />
        )
      })()}
    </div>
  )
}
