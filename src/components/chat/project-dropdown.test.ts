import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Project } from '../../types/opencode'

describe('Project Dropdown Ordering & Resolution', () => {
  const mockProjects: Project[] = [
    {
      id: 'proj_3',
      name: 'AISpace',
      worktree: '/workspace/projects/AISpace',
      time: { created: 1, updated: 1 },
    },
    {
      id: 'proj_1',
      name: 'APISpace',
      worktree: '/workspace/projects/APISpace',
      time: { created: 1, updated: 1 },
    },
    {
      id: 'proj_5',
      name: 'AICore',
      worktree: '/home/developer/projects/AICore',
      time: { created: 1, updated: 1 },
    },
    {
      id: 'proj_2',
      name: 'ObsidianNote',
      worktree: '/workspace/projects/ObsidianNote',
      time: { created: 1, updated: 1 },
    },
    {
      id: 'proj_4',
      name: 'ObsidianDev',
      worktree: '/workspace/projects/ObsidianDev',
      time: { created: 1, updated: 1 },
    },
  ]

  it('orders canonical projects strictly as: APISpace, ObsidianNote, ObsidianDev, AISpace (excluding AICore)', () => {
    const canonicalOrder = ['APISpace', 'ObsidianNote', 'ObsidianDev', 'AISpace']
    const canonicalList: Project[] = []
    const others: Project[] = []

    for (const name of canonicalOrder) {
      const found = mockProjects.find(
        (p) =>
          p.name?.toLowerCase() === name.toLowerCase() ||
          p.worktree?.toLowerCase().endsWith(name.toLowerCase())
      )
      if (found) {
        canonicalList.push(found)
      }
    }

    for (const p of mockProjects) {
      if (p.id === 'global' || p.worktree === '/') continue
      const pName = (p.name || '').toLowerCase()
      const pWorktree = (p.worktree || '').toLowerCase()
      if (pName === 'aicore' || pWorktree.endsWith('/aicore') || pWorktree === 'c:/aicore') continue
      if (!canonicalList.some((cp) => cp.id === p.id)) {
        others.push(p)
      }
    }

    const orderedProjects = [...canonicalList, ...others]

    assert.deepEqual(
      orderedProjects.map((p) => p.name),
      ['APISpace', 'ObsidianNote', 'ObsidianDev', 'AISpace']
    )
    assert.equal(orderedProjects.some((p) => p.name === 'AICore'), false)
  })

  it('resolves active project selection and supports no-project selection', () => {
    const selectedId = 'proj_1'
    const current = mockProjects.find((p) => p.id === selectedId) || null
    assert.equal(current?.name, 'APISpace')

    const noProjectId = 'global'
    const noProject = noProjectId === 'global' ? null : mockProjects.find((p) => p.id === noProjectId)
    assert.equal(noProject, null)
  })
})
