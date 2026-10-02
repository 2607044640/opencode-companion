import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  discoverSkills,
  listSkills,
  parseSkillFrontmatter,
  resolveSkillRoots,
  resolveSkillWorkspace,
  summarizeDescription,
} from './skill-discovery.mjs'
import { handleHostApi } from './host-api.mjs'
import * as skillDiscovery from './skill-discovery.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-disc-'))

function writeSkill(dir: string, name: string, body: string) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), body)
}

before(() => {
  const projects = path.join(tmp, 'projects')
  const ws = path.join(projects, 'DemoSpace')
  writeSkill(
    path.join(ws, '.agents/skills/WorkspaceOnly'),
    'WorkspaceOnly',
    '---\nname: WorkspaceOnly\ndescription: "only in this workspace"\n---\n# body\n',
  )
  writeSkill(
    path.join(projects, 'Catalog/skills/SharedOne'),
    'SharedOne',
    '---\nname: SharedOne\ndescription: "shared catalog skill"\n---\n',
  )
  // Hardlink of the shared package into the workspace must not double-list.
  const sharedDir = path.join(projects, 'Catalog/skills/SharedOne')
  const linkedDir = path.join(ws, '.agents/skills/SharedOne')
  fs.mkdirSync(linkedDir, { recursive: true })
  fs.linkSync(path.join(sharedDir, 'SKILL.md'), path.join(linkedDir, 'SKILL.md'))
  writeSkill(
    path.join(projects, 'Catalog/skills/FoldedDesc'),
    'FoldedDesc',
    '---\nname: FoldedDesc\ndescription: >\n  first line\n  second line\n---\n',
  )
  writeSkill(
    path.join(projects, 'Catalog/skills/BadName'),
    'BadName',
    '---\nname: "not a/name"\ndescription: folder fallback\n---\n',
  )
  fs.mkdirSync(path.join(projects, 'Catalog/skills/NoFront'), { recursive: true })
  fs.writeFileSync(path.join(projects, 'Catalog/skills/NoFront/SKILL.md'), '# no frontmatter\n')
  fs.writeFileSync(path.join(projects, 'Catalog/skills/README.md'), 'not a skill\n')
})

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('skill frontmatter', () => {
  test('reads quoted name and description', () => {
    const fm = parseSkillFrontmatter('---\nname: AICtl\ndescription: "slash me"\n---\nbody')
    assert.equal(fm.name, 'AICtl')
    assert.equal(fm.description, 'slash me')
  })

  test('joins folded descriptions', () => {
    const fm = parseSkillFrontmatter('---\nname: X\ndescription: >\n  one\n  two\n---\n')
    assert.equal(fm.description, 'one two')
  })

  test('summarizeDescription truncates a long blurb', () => {
    const long = 'a'.repeat(200)
    const out = summarizeDescription(long)
    assert.ok(out)
    assert.equal(out!.length, 160)
    assert.equal(out!.endsWith('…'), true)
  })
})

describe('skill discovery', () => {
  const projects = path.join(tmp, 'projects')
  const workspace = path.join(projects, 'DemoSpace')

  test('lists workspace skills before other project catalogs, once per file', () => {
    const skills = listSkills({ projectsRoot: projects, workspaceDir: workspace })
    const names = skills.map((s) => s.name)
    assert.deepEqual(names, ['BadName', 'FoldedDesc', 'NoFront', 'SharedOne', 'WorkspaceOnly'])
    assert.equal(names.filter((n) => n === 'SharedOne').length, 1)
    const shared = skills.find((s) => s.name === 'SharedOne')
    assert.equal(shared?.description, 'shared catalog skill')
    const folded = skills.find((s) => s.name === 'FoldedDesc')
    assert.equal(folded?.description, 'first line second line')
  })

  test('workspace copy wins the description when it is a different file', () => {
    const roots = resolveSkillRoots({ projectsRoot: projects, workspaceDir: workspace })
    assert.ok(roots[0].endsWith(path.join('.agents', 'skills')))
    const found = discoverSkills(roots)
    assert.equal(found.some((s) => s.name === 'WorkspaceOnly'), true)
  })

  test('resolveSkillWorkspace stays inside the projects root', () => {
    assert.equal(resolveSkillWorkspace(workspace, projects), path.resolve(workspace))
    assert.equal(resolveSkillWorkspace('/tmp/evil', projects), null)
    assert.equal(resolveSkillWorkspace(path.join(workspace, '..', '..', 'etc'), projects), null)
  })
})

describe('GET /api/skills', () => {
  const projects = path.join(tmp, 'projects')
  const original = skillDiscovery.skillScan.list

  before(() => {
    skillDiscovery.skillScan.list = (options: { workspaceDir?: string } = {}) =>
      original({ ...options, projectsRoot: projects })
  })

  after(() => {
    skillDiscovery.skillScan.list = original
  })

  test('returns discovered skills and ignores a directory outside projects', async () => {
    const captured: { status: number; body: string } = { status: 0, body: '' }
    const req: any = {
      url: `/api/skills?directory=${encodeURIComponent(path.join(projects, 'DemoSpace'))}`,
      method: 'GET',
    }
    const res: any = {
      statusCode: 0,
      setHeader() {},
      end(data: string) {
        captured.body = data
      },
    }
    const handled = await handleHostApi(req, res)
    assert.equal(handled, true)
    assert.equal(res.statusCode, 200)
    const payload = JSON.parse(captured.body)
    assert.equal(payload.ok, true)
    const names = payload.skills.map((s: { name: string }) => s.name)
    assert.ok(names.includes('WorkspaceOnly'))
    assert.ok(names.includes('SharedOne'))
    assert.equal(names.filter((n: string) => n === 'SharedOne').length, 1)

    const outsider: any = {
      url: `/api/skills?directory=${encodeURIComponent('/tmp/evil')}`,
      method: 'GET',
    }
    const outRes: any = { statusCode: 0, setHeader() {}, end(data: string) { captured.body = data } }
    await handleHostApi(outsider, outRes)
    const outside = JSON.parse(captured.body)
    assert.equal(outside.ok, true)
    assert.equal(outside.skills.some((s: { name: string }) => s.name === 'WorkspaceOnly'), true)
  })
})
