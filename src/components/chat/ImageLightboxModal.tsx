import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon, Maximize2 } from 'lucide-react'

export interface LightboxImage {
  id?: string
  url: string
  filename?: string
}

export interface ImageLightboxModalProps {
  isOpen: boolean
  onClose: () => void
  images: LightboxImage[]
  initialIndex?: number
}

export function ImageLightboxModal({
  isOpen,
  onClose,
  images,
  initialIndex = 0,
}: ImageLightboxModalProps) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (initialIndex >= 0 && initialIndex < images.length) return initialIndex
    return 0
  })

  // Synchronize index if initialIndex changes
  useEffect(() => {
    if (initialIndex >= 0 && initialIndex < images.length) {
      setCurrentIndex(initialIndex)
    }
  }, [initialIndex, images.length])

  const goNext = useCallback(() => {
    if (images.length <= 1) return
    setCurrentIndex((prev) => (prev + 1) % images.length)
  }, [images.length])

  const goPrev = useCallback(() => {
    if (images.length <= 1) return
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
  }, [images.length])

  // Handle keyboard navigation: Esc to close, Left/Right arrows to flip
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, goNext, goPrev])

  if (!isOpen || images.length === 0 || typeof document === 'undefined') {
    return null
  }

  const currentImage = images[currentIndex] || images[0]

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image Preview"
      data-modal="image-lightbox"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 select-none bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="relative flex flex-col bg-[#141720] border border-[#2d3340] rounded-2xl shadow-2xl overflow-hidden max-w-4xl w-full max-h-[92vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#252934] bg-[#11131a] shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <ImageIcon className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="text-xs sm:text-sm font-medium text-zinc-200 truncate">
              {currentImage.filename || '图片预览'}
            </span>
            {images.length > 1 && (
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-zinc-800 text-[11px] font-mono text-zinc-400">
                {currentIndex + 1} / {images.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <a
              href={currentImage.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="在浏览器新标签页打开"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="关闭 (Esc)"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Main Image Display Viewport */}
        <div className="relative flex-1 min-h-[260px] max-h-[76vh] flex items-center justify-center p-4 bg-[#0a0c10] overflow-hidden">
          <img
            src={currentImage.url}
            alt={currentImage.filename || 'Image Preview'}
            className="max-w-full max-h-[72vh] object-contain rounded-lg shadow-xl select-auto"
          />

          {/* Navigation Arrows for Multi-image */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white backdrop-blur-sm border border-white/10 transition-all cursor-pointer shadow-lg hover:scale-110 active:scale-95"
                title="上一张 (←)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white backdrop-blur-sm border border-white/10 transition-all cursor-pointer shadow-lg hover:scale-110 active:scale-95"
                title="下一张 (→)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {/* Bottom Thumbnail Strip (if multiple images) */}
        {images.length > 1 && (
          <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#101218] border-t border-[#222530] overflow-x-auto no-scrollbar shrink-0">
            {images.map((img, idx) => (
              <button
                key={img.id || idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`w-11 h-11 rounded-lg overflow-hidden border transition-all shrink-0 cursor-pointer ${
                  idx === currentIndex
                    ? 'border-purple-500 ring-2 ring-purple-500/40 opacity-100 scale-105'
                    : 'border-zinc-700/60 opacity-50 hover:opacity-85'
                }`}
                title={img.filename || `图片 ${idx + 1}`}
              >
                <img src={img.url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export interface ImageThumbnailRowProps {
  images: LightboxImage[]
  onOpenLightbox: (index: number) => void
}

export function ImageThumbnailRow({ images, onOpenLightbox }: ImageThumbnailRowProps) {
  if (!images || images.length === 0) return null

  return (
    <div className="flex flex-row flex-wrap items-center gap-2.5 my-2">
      {images.map((img, idx) => (
        <button
          key={img.id || idx}
          type="button"
          onClick={() => onOpenLightbox(idx)}
          title={img.filename || `图片 ${idx + 1} (点击查看大图)`}
          className="group relative w-16 h-16 rounded-xl overflow-hidden border border-[#2e3340] bg-[#12141a] shrink-0 cursor-pointer shadow-sm hover:border-purple-500/80 hover:shadow-purple-500/20 hover:scale-[1.03] transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        >
          <img
            src={img.url}
            alt={img.filename || `图片 ${idx + 1}`}
            className="w-full h-full object-cover group-hover:opacity-95 transition-opacity"
            loading="lazy"
          />
          {/* Subtle hover overlay icon */}
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Maximize2 className="w-4 h-4 text-white drop-shadow-md" />
          </div>
        </button>
      ))}
    </div>
  )
}
