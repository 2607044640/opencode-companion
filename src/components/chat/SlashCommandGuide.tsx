import {
  ListTodo,
  Target,
  Clock,
  Minimize2,
  Globe,
  HelpCircle,
  Users,
  BookOpen,
  Zap,
  MessageSquareQuote,
  FileText,
  Heading,
  Undo2,
  X,
  Sparkles,
} from 'lucide-react'
import type { SlashCommandDefinition } from '../../utils/slash-commands'

interface SlashCommandGuideProps {
  definition: SlashCommandDefinition
  args: string
  onSelectPreset: (presetValue: string) => void
  onClearCommand: () => void
  isZh?: boolean
}

function getCommandIcon(iconName: string) {
  switch (iconName) {
    case 'ListTodo':
      return <ListTodo className="w-3.5 h-3.5 text-sky-400" />
    case 'Target':
      return <Target className="w-3.5 h-3.5 text-rose-400" />
    case 'Clock':
      return <Clock className="w-3.5 h-3.5 text-amber-400" />
    case 'Minimize2':
      return <Minimize2 className="w-3.5 h-3.5 text-cyan-400" />
    case 'Globe':
      return <Globe className="w-3.5 h-3.5 text-emerald-400" />
    case 'HelpCircle':
      return <HelpCircle className="w-3.5 h-3.5 text-violet-400" />
    case 'Users':
      return <Users className="w-3.5 h-3.5 text-indigo-400" />
    case 'BookOpen':
      return <BookOpen className="w-3.5 h-3.5 text-teal-400" />
    case 'Zap':
      return <Zap className="w-3.5 h-3.5 text-yellow-400" />
    case 'MessageSquareQuote':
      return <MessageSquareQuote className="w-3.5 h-3.5 text-blue-400" />
    case 'FileText':
      return <FileText className="w-3.5 h-3.5 text-zinc-400" />
    case 'Heading':
      return <Heading className="w-3.5 h-3.5 text-zinc-400" />
    case 'Undo2':
      return <Undo2 className="w-3.5 h-3.5 text-amber-400" />
    default:
      return <Sparkles className="w-3.5 h-3.5 text-sky-400" />
  }
}

export function SlashCommandGuide({
  definition,
  args,
  onSelectPreset,
  onClearCommand,
  isZh = false,
}: SlashCommandGuideProps) {
  const icon = getCommandIcon(definition.icon)
  const description = definition.description || (isZh ? definition.descriptionZh : '')
  const presets = definition.presets || []

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 bg-[#141822]/95 border-b border-sky-900/40 text-xs animate-in fade-in-50 duration-150 select-none">
      {/* Header Row: Badge + Description + Syntax + Clear */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-950/70 border border-sky-500/40 text-sky-200 font-mono text-[11px] font-semibold shrink-0 shadow-xs">
            {icon}
            <span>/{definition.name}</span>
          </span>

          <span className="text-zinc-300 font-medium truncate max-w-[280px] sm:max-w-md">
            {description}
          </span>

          {definition.argumentHint && (
            <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
              Usage: /{definition.name} {definition.argumentHint}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClearCommand}
          className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/80 transition-colors cursor-pointer shrink-0"
          title="Dismiss command"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Preset Chips Row: Instant argument guidance */}
      {presets.length > 0 && !args && (
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mr-0.5">
            Presets:
          </span>
          {presets.map((preset, idx) => (
            <button
              key={`${preset.label}_${idx}`}
              type="button"
              onClick={() => onSelectPreset(preset.value)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1b2230] hover:bg-sky-950/80 border border-sky-800/40 hover:border-sky-500/60 text-[11px] text-sky-300 hover:text-sky-100 transition-all cursor-pointer shadow-2xs"
              title={preset.description || preset.value}
            >
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
