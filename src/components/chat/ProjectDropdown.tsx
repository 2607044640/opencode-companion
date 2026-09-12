import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  Folder,
  ChevronDown,
  Settings,
  Check,
  FolderPlus,
  Compass,
  FolderX,
} from 'lucide-react'
import type { Project, Session } from '../../types/opencode'
import { useI18n } from '../../utils/i18n'
import { NewProjectModal } from './NewProjectModal'
import { ProjectSettingsModal } from './ProjectSettingsModal'

export interface ProjectDropdownProps {
  projects: Project[]
  selectedProjectId: string | null
  sessions?: Session[]
  onSelectProject: (projectId: string | null) => void
  onNewProject?: (name: string, path: string) => Promise<void> | void
  onQuickStart?: () => void
}

export const ProjectDropdown: React.FC<ProjectDropdownProps> = ({
  projects,
  selectedProjectId,
  sessions = [],
  onSelectProject,
  onNewProject,
  onQuickStart,
}) => {
  const { lang } = useI18n()
  const isZh = lang.startsWith('zh')
  const [isOpen, setIsOpen] = useState(false)
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false)
  const [settingsProject, setSettingsProject] = useState<Project | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close dropdown on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Find active project
  const currentProject = useMemo(() => {
    if (!selectedProjectId || selectedProjectId === 'global') return null
    return (
      projects.find(
        (p) =>
          p.id === selectedProjectId ||
          Boolean(p.associatedIds && p.associatedIds.includes(selectedProjectId))
      ) || null
    )
  }, [projects, selectedProjectId])

  const currentDisplayName = currentProject ? currentProject.name || currentProject.id : (isZh ? '全部项目' : 'APISpace')

  // Canonical projects ordering: APISpace, ObsidianNote, ObsidianDev, NullSpace, AISpace
  const orderedProjects = useMemo(() => {
    const canonicalOrder = ['APISpace', 'ObsidianNote', 'ObsidianDev', 'NullSpace', 'AISpace']
    const canonicalList: Project[] = []
    const others: Project[] = []

    for (const name of canonicalOrder) {
      const found = projects.find(
        (p) =>
          p.name?.toLowerCase() === name.toLowerCase() ||
          p.worktree?.toLowerCase().endsWith(name.toLowerCase())
      )
      if (found) {
        canonicalList.push(found)
      }
    }

    for (const p of projects) {
      if (p.id === 'global' || p.worktree === '/') continue
      if (!canonicalList.some((cp) => cp.id === p.id)) {
        others.push(p)
      }
    }

    return [...canonicalList, ...others]
  }, [projects])

  // Session count per project
  const projectSessionCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const sess of sessions) {
      if (!sess.projectID) continue
      map.set(sess.projectID, (map.get(sess.projectID) || 0) + 1)
    }
    return map
  }, [sessions])

  return (
    <>
      <div ref={containerRef} className="relative inline-block select-none">
        {/* Trigger Button: 📁 <CurrentProject> ⌄ */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors text-xs font-medium cursor-pointer group"
          title={isZh ? '选择会话所属工作区项目' : 'Select workspace project'}
        >
          <Folder className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
          <span className="tracking-tight">{currentDisplayName}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-zinc-300' : 'group-hover:text-zinc-400'
            }`}
          />
        </button>

        {/* Dropdown Menu matching Image 3 */}
        {isOpen && (
          <div
            className="absolute left-0 top-full mt-1.5 w-60 rounded-xl bg-[#15171e]/98 backdrop-blur-md border border-[#272b36] shadow-2xl p-1 z-50 animate-in fade-in zoom-in-95 duration-150"
            role="menu"
          >
            {/* Project List */}
            <div className="space-y-0.5 max-h-60 overflow-y-auto no-scrollbar">
              {orderedProjects.map((proj) => {
                const isSelected =
                  currentProject?.id === proj.id ||
                  Boolean(currentProject?.associatedIds?.includes(proj.id)) ||
                  (!currentProject && proj.name === 'APISpace')

                return (
                  <div
                    key={proj.id}
                    onClick={() => {
                      onSelectProject(proj.id)
                      setIsOpen(false)
                    }}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer group ${
                      isSelected
                        ? 'bg-[#1e222c] text-zinc-100 font-medium'
                        : 'text-zinc-300 hover:bg-[#1b1e26] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Folder className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{proj.name || proj.id}</span>
                    </div>

                    {/* Right cluster: Gear ⚙️ + Checkmark ✓ for active project */}
                    {isSelected && (
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSettingsProject(proj)
                          }}
                          className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60 rounded transition-colors"
                          title={isZh ? '项目配置' : 'Project settings'}
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        <Check className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Divider Line */}
            <div className="my-1 border-t border-[#232732]" />

            {/* Action Items matching Image 3 */}
            <div className="space-y-0.5">
              {/* 1. New Project (新建项目) */}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  setIsNewProjectOpen(true)
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-[#1b1e26] transition-colors cursor-pointer text-left"
              >
                <FolderPlus className="w-3.5 h-3.5 text-zinc-400" />
                <span>{isZh ? '新建项目' : 'New Project'}</span>
              </button>

              {/* 2. Quick Start (快速开始) */}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  if (onQuickStart) {
                    onQuickStart()
                  }
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-[#1b1e26] transition-colors cursor-pointer text-left"
              >
                <Compass className="w-3.5 h-3.5 text-zinc-400" />
                <span>{isZh ? '快速开始' : 'Quick Start'}</span>
              </button>

              {/* 3. No Project (无特定项目) */}
              <button
                type="button"
                onClick={() => {
                  onSelectProject('global')
                  setIsOpen(false)
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                  selectedProjectId === 'global' || selectedProjectId === null
                    ? 'bg-[#1e222c] text-zinc-100 font-medium'
                    : 'text-zinc-400 hover:text-white hover:bg-[#1b1e26]'
                }`}
              >
                <FolderX className="w-3.5 h-3.5 text-zinc-400" />
                <span>{isZh ? '无特定项目' : 'No Project'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New Project Modal Dialog */}
      <NewProjectModal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        onConfirm={async (name, path) => {
          if (onNewProject) {
            await onNewProject(name, path)
          }
        }}
      />

      {/* Project Settings Modal */}
      <ProjectSettingsModal
        isOpen={Boolean(settingsProject)}
        project={settingsProject}
        sessionCount={settingsProject ? projectSessionCounts.get(settingsProject.id) || 0 : 0}
        onClose={() => setSettingsProject(null)}
      />
    </>
  )
}
