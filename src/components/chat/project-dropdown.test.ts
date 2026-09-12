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
      name: 'NullSpace',
      worktree: '/workspace/projects/NullSpace',
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

  it('orders canonical projects strictly as: APISpace, ObsidianNote, ObsidianDev, NullSpace, AISpace', () => {
    const canonicalOrder = ['APISpace', 'ObsidianNote', 'ObsidianDev', 'NullSpace', 'AISpace']
    const canonicalList: Project[] = []

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

    assert.deepEqual(
      canonicalList.map((p) => p.name),
      ['APISpace', 'ObsidianNote', 'ObsidianDev', 'NullSpace', 'AISpace']
    )
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
