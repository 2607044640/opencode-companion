import { FileCode, FileText } from 'lucide-react'

interface FileTypeIconProps {
  filename: string
  className?: string
}

export function FileTypeIcon({ filename, className }: FileTypeIconProps) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  if (ext === 'py') {
    return (
      <svg className={className || "w-4 h-4 shrink-0"} viewBox="0 0 24 24" fill="none">
        <path
          d="M11.914 2C6.837 2 7.158 4.204 7.158 4.204l.006 2.28h4.82v.684H5.21S2 6.81 2 11.905c0 5.094 2.801 4.908 2.801 4.908h1.669v-2.348s-.09-2.802 2.766-2.802h4.757v-.713s.416-2.803-2.079-4.95"
          fill="#38bdf8"
        />
        <path
          d="M12.086 22c5.077 0 4.756-2.204 4.756-2.204l-.006-2.28h-4.82v-.684h6.774S22 17.19 22 12.095c0-5.094-2.801-4.908-2.801-4.908h-1.669v2.348s.09 2.802-2.766 2.802H9.997v.713s-.416 2.803 2.079 4.95"
          fill="#34d399"
        />
        <circle cx="8.8" cy="5.2" r="0.8" fill="#15171e" />
        <circle cx="15.2" cy="18.8" r="0.8" fill="#15171e" />
      </svg>
    )
  }

  if (ext === 'ts') {
    return (
      <span className={`w-3.5 h-3.5 rounded-[2px] bg-[#3178c6] text-[9px] font-bold text-white flex items-center justify-center shrink-0 select-none tracking-tighter ${className || ''}`}>
        TS
      </span>
    )
  }

  if (ext === 'tsx' || ext === 'jsx') {
    return (
      <svg className={`shrink-0 text-[#61dafb] ${className || 'w-4 h-4'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="2.2" fill="currentColor" />
        <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(30 12 12)" />
        <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(90 12 12)" />
        <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(150 12 12)" />
      </svg>
    )
  }

  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') {
    return (
      <span className={`w-3.5 h-3.5 rounded-[2px] bg-[#f7df1e] text-[9px] font-bold text-black flex items-center justify-center shrink-0 select-none tracking-tighter ${className || ''}`}>
        JS
      </span>
    )
  }

  if (ext === 'json') {
    return <FileCode className={`text-amber-400 shrink-0 ${className || 'w-4 h-4'}`} />
  }

  if (ext === 'css' || ext === 'scss' || ext === 'less') {
    return <FileCode className={`text-pink-400 shrink-0 ${className || 'w-4 h-4'}`} />
  }

  if (ext === 'md' || ext === 'txt') {
    return <FileText className={`text-zinc-400 shrink-0 ${className || 'w-4 h-4'}`} />
  }

  return <FileCode className={`text-zinc-400 shrink-0 ${className || 'w-4 h-4'}`} />
}
