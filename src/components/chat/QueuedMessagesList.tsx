import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Send, Trash2 } from 'lucide-react'
import type { QueuedMessage } from '../../utils/message-queue'
import { queuedImageAttachments } from '../../utils/message-queue'
import { useI18n } from '../../utils/i18n'

interface QueuedMessagesListProps {
  items: QueuedMessage[]
  onSendNow: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

export function QueuedMessagesList({ items, onSendNow, onEdit, onDelete }: QueuedMessagesListProps) {
  const { tr } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const pendingItem = pendingDeleteId ? items.find((item) => item.id === pendingDeleteId) ?? null : null

  useEffect(() => {
    if (!pendingItem) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const id = pendingItem.id
        setPendingDeleteId(null)
        onDelete(id)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setPendingDeleteId(null)
      }
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [pendingItem, onDelete])

  if (items.length === 0) return null

  return (
    <div className="mb-2 rounded-xl border border-[#2a2e37] bg-[#16181d] overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1c1f26] transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        )}
        <span className="text-xs font-medium text-zinc-200">
          {tr('排队消息', 'Queued Messages', 'Nachrichten in der Warteschlange')}
        </span>
        <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-zinc-700 text-[11px] text-zinc-100 inline-flex items-center justify-center">
          {items.length}
        </span>
        <span className="text-[11px] text-zinc-500 truncate">
          {tr(
            '模型结束后发送',
            'Sends after agent finishes working',
            'Wird gesendet, wenn der Agent fertig ist'
          )}
        </span>
      </button>

      {!collapsed && (
        <ul className="border-t border-[#2a2e37]">
          {items.map((item) => {
            const images = queuedImageAttachments(item)
            const preview = item.text.trim() || (images.length > 0 ? '' : tr('(附件)', '(attachment)', '(Anhang)'))
            const extra = images.length > 1 ? images.length - 1 : 0
            return (
              <li
                key={item.id}
                className="flex items-center gap-2 px-3 py-2 border-b border-[#22262e] last:border-b-0"
              >
                {images.length > 0 && (
                  <span className="relative shrink-0 w-8 h-8">
                    <img
                      src={images[0].url}
                      alt={images[0].name || ''}
                      className="w-8 h-8 rounded-md object-cover border border-[#2e333d] bg-[#1a1d24]"
                    />
                    {extra > 0 && (
                      <span className="absolute -bottom-1 -right-1 min-w-[1.1rem] h-4 px-1 rounded bg-zinc-800 border border-[#3a3f4a] text-[10px] leading-4 text-zinc-100 text-center">
                        +{extra}
                      </span>
                    )}
                  </span>
                )}
                <span className="flex-1 min-w-0 text-sm text-zinc-200 truncate" title={preview}>
                  {preview}
                </span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSendNow(item.id)}
                    className="w-7 h-7 rounded-md text-zinc-400 hover:text-white hover:bg-[#2a2e37] flex items-center justify-center"
                    title={tr('立即发送', 'Send now', 'Jetzt senden')}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(item.id)}
                    className="w-7 h-7 rounded-md text-zinc-400 hover:text-white hover:bg-[#2a2e37] flex items-center justify-center"
                    title={tr('编辑', 'Edit', 'Bearbeiten')}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(item.id)}
                    className="w-7 h-7 rounded-md text-zinc-400 hover:text-rose-300 hover:bg-[#2a2e37] flex items-center justify-center"
                    title={tr('删除', 'Delete', 'Löschen')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {pendingItem && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPendingDeleteId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-xl border border-[#2a2e37] bg-[#16181d] shadow-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-zinc-100">
              {tr('是否删除这个消息？', 'Delete this queued message?', 'Diese Nachricht löschen?')}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {tr('Enter 确认，Esc 取消', 'Enter to confirm, Esc to cancel', 'Enter bestätigt, Esc bricht ab')}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                className="h-8 px-3 rounded-md text-xs text-zinc-300 hover:bg-[#2a2e37]"
              >
                {tr('取消', 'Cancel', 'Abbrechen')}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  const id = pendingItem.id
                  setPendingDeleteId(null)
                  onDelete(id)
                }}
                className="h-8 px-3 rounded-md text-xs bg-rose-600 hover:bg-rose-500 text-white"
              >
                {tr('删除', 'Delete', 'Löschen')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
