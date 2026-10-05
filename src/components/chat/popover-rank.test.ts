import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  scorePopoverItem,
  rankPopoverItems,
  splitCamelCaseParts,
  matchCamelCase,
  matchSubsequence,
  type PopoverRankItem,
} from './popover-rank'

describe('popover-rank CamelCase & fuzzy ranking tests (Rider/VS Code style)', () => {
  test('splitCamelCaseParts correctly splits CamelCase, snake_case, and kebab-case', () => {
    assert.deepEqual(splitCamelCaseParts('InstructionDesignPrinciples'), [
      'instruction',
      'design',
      'principles',
    ])
    assert.deepEqual(splitCamelCaseParts('WebResearch'), ['web', 'research'])
    assert.deepEqual(splitCamelCaseParts('Explicit_CCSwitchHelper'), [
      'explicit',
      'cc',
      'switch',
      'helper',
    ])
    assert.deepEqual(splitCamelCaseParts('GitSync'), ['git', 'sync'])
    assert.deepEqual(splitCamelCaseParts('database-tool-creator'), [
      'database',
      'tool',
      'creator',
    ])
  })

  test('matchCamelCase matches Rider/VS Code style CamelHump queries', () => {
    // User exact requirement: "insde" -> "InstructionDesignPrinciples"
    assert.equal(matchCamelCase('InstructionDesignPrinciples', 'insde'), true)
    assert.equal(matchCamelCase('InstructionDesignPrinciples', 'idp'), true)
    assert.equal(matchCamelCase('InstructionDesignPrinciples', 'insdep'), true)
    assert.equal(matchCamelCase('InstructionDesignPrinciples', 'instdes'), true)

    // User example: "/WebResearch" via "webre" or "wr"
    assert.equal(matchCamelCase('WebResearch', 'webre'), true)
    assert.equal(matchCamelCase('WebResearch', 'wr'), true)
    assert.equal(matchCamelCase('WebResearch', 'WR'), true)

    // Other skill examples
    assert.equal(matchCamelCase('GitSync', 'gs'), true)
    assert.equal(matchCamelCase('TaskRouter', 'tr'), true)
    assert.equal(matchCamelCase('database-tool-creator', 'dtc'), true)
    assert.equal(matchCamelCase('Explicit_CCSwitchHelper', 'ccsw'), true)

    // Negative case
    assert.equal(matchCamelCase('TaskRouter', 'insde'), false)
  })

  test('matchSubsequence matches characters in sequential order across full field', () => {
    assert.equal(matchSubsequence('InstructionDesignPrinciples', 'insde'), true)
    assert.equal(matchSubsequence('InstructionDesignPrinciples', 'insprin'), true)
    assert.equal(matchSubsequence('WebResearch', 'webrch'), true)
    assert.equal(matchSubsequence('TaskRouter', 'xyz'), false)
  })

  test('rankPopoverItems brings InstructionDesignPrinciples to top for query "insde"', () => {
    const items: PopoverRankItem[] = [
      {
        type: 'skill',
        item: {
          name: 'Explicit_CCSwitchHelper',
          description: 'When configuring CC Switch for API routing, failover',
        },
      },
      {
        type: 'skill',
        item: {
          name: 'TaskRouter',
          description: 'Route tasks by difficulty and process',
        },
      },
      {
        type: 'skill',
        item: {
          name: 'InstructionDesignPrinciples',
          description: 'Read this file before formatting or editing rules',
        },
      },
    ]

    const ranked = rankPopoverItems(items, 'insde')
    assert.ok(ranked.length >= 1)
    assert.equal((ranked[0].item as any).name, 'InstructionDesignPrinciples')
  })

  test('rankPopoverItems brings WebResearch to top for query "webre" and "wr"', () => {
    const items: PopoverRankItem[] = [
      {
        type: 'command',
        item: {
          name: 'help',
          description: 'Help manual for web commands',
        },
      },
      {
        type: 'skill',
        item: {
          name: 'WebResearch',
          description: 'Conduct deep web research and investigation',
        },
      },
    ]

    const rankedWebre = rankPopoverItems(items, 'webre')
    assert.equal((rankedWebre[0].item as any).name, 'WebResearch')

    const rankedWR = rankPopoverItems(items, 'wr')
    assert.equal((rankedWR[0].item as any).name, 'WebResearch')
  })

  test('title prefix match strictly outranks description match', () => {
    const items: PopoverRankItem[] = [
      {
        type: 'skill',
        item: {
          name: 'Explicit_CCSwitchHelper',
          description:
            'When configuring CC Switch for API routing, failover, or instruction updates',
        },
      },
      {
        type: 'skill',
        item: {
          name: 'InstructionDesignPrinciples',
          description:
            'Read this file before formatting, auditing, compressing, or editing',
        },
      },
    ]

    const ranked = rankPopoverItems(items, 'instru')
    assert.equal(ranked.length, 2)
    assert.equal((ranked[0].item as any).name, 'InstructionDesignPrinciples')
    assert.equal((ranked[1].item as any).name, 'Explicit_CCSwitchHelper')
  })

  test('exact title match has highest priority', () => {
    const items: PopoverRankItem[] = [
      {
        type: 'command',
        item: {
          name: 'clear_cache',
          description: 'Clears the cache',
        },
      },
      {
        type: 'command',
        item: {
          name: 'clear',
          description: 'Clear dialogue history',
        },
      },
    ]

    const ranked = rankPopoverItems(items, 'clear')
    assert.equal((ranked[0].item as any).name, 'clear')
    assert.equal((ranked[1].item as any).name, 'clear_cache')
  })

  test('title word-boundary match outranks description-only match', () => {
    const items: PopoverRankItem[] = [
      {
        type: 'skill',
        item: {
          name: 'TaskRouter',
          description: 'Includes prompt optimization guidelines',
        },
      },
      {
        type: 'skill',
        item: {
          name: 'Explicit_PromptAudit',
          description: 'Audits prompt engineering techniques',
        },
      },
    ]

    const ranked = rankPopoverItems(items, 'prompt')
    assert.equal(ranked.length, 2)
    assert.equal((ranked[0].item as any).name, 'Explicit_PromptAudit')
    assert.equal((ranked[1].item as any).name, 'TaskRouter')
  })

  test('empty query preserves original candidate order', () => {
    const items: PopoverRankItem[] = [
      { type: 'command', item: { name: 'help' } },
      { type: 'skill', item: { name: 'AICtl' } },
    ]

    const ranked = rankPopoverItems(items, '')
    assert.equal(ranked.length, 2)
    assert.equal((ranked[0].item as any).name, 'help')
    assert.equal((ranked[1].item as any).name, 'AICtl')
  })

  test('filters out items that match neither title nor description', () => {
    const items: PopoverRankItem[] = [
      { type: 'command', item: { name: 'export', description: 'Export history' } },
      { type: 'skill', item: { name: 'GitSync', description: 'Sync git repos' } },
    ]

    const ranked = rankPopoverItems(items, 'zzz')
    assert.equal(ranked.length, 0)
  })

  test('handles regex special characters safely', () => {
    const items: PopoverRankItem[] = [
      { type: 'skill', item: { name: 'C++_Guide', description: 'C++ programming' } },
    ]

    assert.doesNotThrow(() => {
      const ranked = rankPopoverItems(items, 'c++')
      assert.equal(ranked.length, 1)
    })
  })

  test('scorePopoverItem verifies invariant score(title) < score(description-only)', () => {
    const titleScore = scorePopoverItem('MySkillName', 'Other text', 'skill')
    const descScore = scorePopoverItem('OtherName', 'My skill in desc', 'skill')
    assert.ok(titleScore < 50, `titleScore should be < 50, got ${titleScore}`)
    assert.ok(descScore >= 100, `descScore should be >= 100, got ${descScore}`)
    assert.ok(titleScore < descScore)
  })
})
