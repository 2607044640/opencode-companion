import { RotateCcw, Loader2, History } from 'lucide-react'
import { useI18n } from '../../utils/i18n'
import type { SessionRevert } from '../../types/opencode'

interface RevertBannerProps {
  revert: SessionRevert
  revertTime?: string
  isReverting?: boolean
  onUnrevert: () => void
}

export function RevertBanner({
  revertTime,
  isReverting,
  onUnrevert,
}: RevertBannerProps) {
  const { t } = useI18n()

  return (
    <div className="w-full max-w-4xl mx-auto px-4 my-3 transition-all duration-300 animate-in fade-in slide-in-from-top-2">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#141822] via-[#12151d] to-[#12131a] border border-sky-800/40 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl backdrop-blur-md">
        {/* Sky Left Accent Border */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-sky-400" />

        <div className="flex items-center gap-3 pl-2">
          <div className="w-8 h-8 rounded-lg bg-sky-950/60 border border-sky-800/50 flex items-center justify-center shrink-0 text-sky-400">
            <History className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-sky-200 flex items-center gap-2">
              <span>{t.chat.revertBannerTitle(revertTime)}</span>
              <span className="px-1.5 py-0.5 rounded bg-sky-950/60 border border-sky-700/50 text-[10px] font-mono text-sky-300">
                {t.chat.revertedBadge}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {t.chat.revertBannerDesc}
            </p>
          </div>
        </div>

        <button
          onClick={onUnrevert}
          disabled={isReverting}
          className="self-end sm:self-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-950/60 hover:bg-sky-900/60 active:bg-sky-800/60 border border-sky-700/50 text-xs font-medium text-sky-200 hover:text-sky-100 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          title={t.chat.unrevertBtn}
        >
          {isReverting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
          ) : (
            <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
          )}
          <span>{isReverting ? t.chat.unreverting : t.chat.unrevertBtn}</span>
        </button>
      </div>
    </div>
  )
}
