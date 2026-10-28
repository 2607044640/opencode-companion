import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  buildCompositeChain,
  clampPriority,
  clampTimeout,
  fetchRouterDocument,
  getModelRemainingSeconds,
  isModelCooling,
  loadRouterSettings,
  makePrimary,
  parseSSOT,
  putRouterDocument,
  recordFailure,
  resetAllCircuitBreakers,
  saveRouterSettings,
  type ModelGroup,
  type ModelItem,
  type RoutingSettings,
  type SubagentBinding,
} from '../../utils/model-router'
import { RelayHubSettings } from '../settings/RelayHubSettings'

type TabId = 'workflow' | 'standalone' | 'subagents' | 'queue' | 'relay' | 'ssot'

const TABS: { id: TabId; label: (settings: RoutingSettings, chainLength: number) => string }[] = [
  { id: 'workflow', label: () => '活跃工作流' },
  { id: 'standalone', label: (s) => `模型 (${s.standaloneModels.length})` },
  { id: 'subagents', label: () => 'Subagent 矩阵' },
  { id: 'queue', label: (_s, n) => `降级队列 (${n})` },
  { id: 'relay', label: () => '中转额度' },
  { id: 'ssot', label: () => 'JSON' },
]

const SUBAGENT_ORDER = ['prometheus', 'atlas', 'researcher', 'explore', 'librarian', 'scout']

export interface FloatingModelRouterProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly initialTab?: TabId
}

export function FloatingModelRouter({ isOpen, onClose, initialTab = 'workflow' }: FloatingModelRouterProps) {
  const [settings, setSettings] = useState<RoutingSettings>(() => loadRouterSettings())
  const [, setRevision] = useState(0)
  const [sourcePath, setSourcePath] = useState('')
  const [tab, setTab] = useState<TabId>(initialTab)
  const [now, setNow] = useState(() => Date.now())
  const [notice, setNotice] = useState<string | null>(null)
  const [jsonText, setJsonText] = useState('')
  const [jsonDirty, setJsonDirty] = useState(false)
  const saveLock = useRef(false)
  const revisionRef = useRef(0)

  const chain = useMemo(() => buildCompositeChain(settings, now), [settings, now])
  const cooling = chain.some((model) => isModelCooling(model, now))

  const applyLoaded = (loaded: RoutingSettings, nextRevision: number, path = '') => {
    setSettings(loaded)
    setRevision(nextRevision)
    revisionRef.current = nextRevision
    if (path) setSourcePath(path)
    if (!jsonDirty) setJsonText(JSON.stringify(loaded, null, 2))
  }

  useEffect(() => {
    if (!isOpen) return
    setTab(initialTab)
    setJsonDirty(false)
    let stop = false
    void fetchRouterDocument().then((remote) => {
      if (stop) return
      if (remote) applyLoaded(remote.settings, remote.revision, remote.path)
      else applyLoaded(loadRouterSettings(), 0)
    })
    const timer = window.setInterval(() => {
      if (saveLock.current || jsonDirty) return
      void fetchRouterDocument().then((remote) => {
        if (!remote || remote.revision === revisionRef.current) return
        applyLoaded(remote.settings, remote.revision, remote.path)
      })
    }, 4000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [isOpen, initialTab])

  useEffect(() => {
    if (!isOpen || !cooling) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isOpen, cooling])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2400)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        setTab((current) => {
          const index = TABS.findIndex((item) => item.id === current)
          const step = event.shiftKey ? -1 : 1
          return TABS[(index + step + TABS.length) % TABS.length].id
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  const commit = (next: RoutingSettings, message?: string) => {
    const stamped: RoutingSettings = { ...next, updatedAt: new Date().toISOString() }
    setSettings(stamped)
    saveRouterSettings(stamped)
    if (!jsonDirty) setJsonText(JSON.stringify(stamped, null, 2))
    if (message) setNotice(message)
    if (revisionRef.current <= 0) return
    saveLock.current = true
    void putRouterDocument(stamped, revisionRef.current).then((result) => {
      saveLock.current = false
      if (result.ok) {
        applyLoaded(result.settings, result.revision, sourcePath)
        return
      }
      if (result.conflict) {
        applyLoaded(result.conflict, revisionRef.current, sourcePath)
        setNotice('文件刚被别的写入更新，已重新载入')
        return
      }
      setNotice(result.error)
    })
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-modal="model-router"
      data-floating-modal="model-router"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex h-[82vh] max-h-[920px] w-[min(1080px,94vw)] flex-col overflow-hidden rounded-xl border border-[#2a3140] bg-[#12151c] text-[#e6edf3] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[#2a3140] px-3 py-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5" role="tablist" aria-label="模型路由">
            {TABS.map((item) => {
              const active = tab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(item.id)}
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    active
                      ? 'border-violet-400/70 bg-violet-500/15 font-semibold text-violet-200'
                      : 'border-transparent text-zinc-400 hover:bg-[#1c2230] hover:text-zinc-100'
                  }`}
                >
                  {item.label(settings, chain.length)}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-[#1c2230] hover:text-white"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'workflow' && (
            <WorkflowTab settings={settings} chain={chain} now={now} cooling={cooling} onCommit={commit} />
          )}
          {tab === 'standalone' && <StandaloneTab settings={settings} now={now} onCommit={commit} />}
          {tab === 'relay' && <RelayHubSettings />}
          {tab === 'subagents' && <SubagentTab settings={settings} onCommit={commit} />}
          {tab === 'queue' && (
            <QueueTab settings={settings} chain={chain} now={now} onCommit={commit} />
          )}
          {tab === 'ssot' && (
            <SsotTab
              sourcePath={sourcePath}
              jsonText={jsonText}
              onChange={(value) => {
                setJsonText(value)
                setJsonDirty(true)
              }}
              onCopy={() => {
                void navigator.clipboard?.writeText(jsonText)
                setNotice('OpenCode SSOT 配置已复制到剪贴板')
              }}
              onImport={() => {
                const parsed = parseSSOT(jsonText)
                if (!parsed.success) {
                  setNotice(`导入失败: ${parsed.error}`)
                  return
                }
                setJsonDirty(false)
                commit(parsed.data, '配置已导入并生效')
              }}
            />
          )}
        </div>

        {notice && (
          <div className="border-t border-[#2a3140] px-4 py-2 text-xs text-emerald-300">{notice}</div>
        )}
      </div>
    </div>
  )
}

function WorkflowTab({
  settings,
  chain,
  now,
  cooling,
  onCommit,
}: {
  settings: RoutingSettings
  chain: ModelItem[]
  now: number
  cooling: boolean
  onCommit: (next: RoutingSettings, message?: string) => void
}) {
  const selected = normalizeSelection(settings)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-zinc-300">活跃工作流组合：</span>
        <select
          aria-label="活跃工作流组合"
          value={selected}
          onChange={(event) => onCommit(applyWorkflowSelection(settings, event.target.value))}
          className="min-w-[280px] flex-1 rounded-md border border-[#323848] bg-[#0e1117] px-2 py-1.5 text-sm"
        >
          <option value="all-active">按优先级自动降级</option>
          {settings.standaloneModels.map((model) => (
            <option key={model.id} value={`model:${model.id}`}>
              {model.name} (P:{model.priority})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (!selected.startsWith('model:')) return
            onCommit(makePrimary(settings, selected), '已设为主力')
          }}
          className="rounded-md border border-violet-400/50 px-3 py-1.5 text-xs text-violet-100 hover:bg-violet-500/10"
        >
          设为主力
        </button>
        <button
          type="button"
          onClick={() => onCommit(resetAllCircuitBreakers(settings), '已重置所有熔断')}
          className={`rounded-md border px-3 py-1.5 text-xs ${
            cooling
              ? 'border-amber-400/60 bg-amber-500/10 text-amber-200'
              : 'border-[#323848] text-zinc-300 hover:bg-[#1c2230]'
          }`}
        >
          重置所有熔断
        </button>
      </div>

      <div className="rounded-lg border border-[#2a3140] bg-[#0e1117] p-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span>最终生效候选链 (按 Priority 严格降序去重排队)</span>
          <span className="text-xs text-emerald-300">{chain.length} 个模型就绪</span>
        </div>
        {chain.length === 0 ? (
          <div className="text-xs text-zinc-500">暂无激活候选模型。</div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {chain.map((model, index) => (
              <div key={model.id} className="flex items-center gap-2">
                <span
                  className={`rounded-md border px-2 py-1 text-xs ${
                    isModelCooling(model, now)
                      ? 'border-amber-500/50 text-amber-200'
                      : index === 0
                        ? 'border-violet-400/50 bg-violet-500/10'
                        : 'border-[#323848]'
                  }`}
                >
                  #{index + 1} P:{model.priority} {model.name}
                  <span className="text-zinc-500"> (来自: {model.sourceGroupName})</span>
                  <span className="ml-1 text-zinc-400">{model.ttftTimeout}s</span>
                  {isModelCooling(model, now) && (
                    <span className="ml-1 text-amber-300">冷却 {getModelRemainingSeconds(model, now)}s</span>
                  )}
                </span>
                {index < chain.length - 1 && <span className="text-zinc-500">➔</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** @deprecated Group editor is not mounted. Stored groups still round-trip through JSON. */
export function GroupsTab({
  settings,
  chain,
  now,
  onCommit,
}: {
  settings: RoutingSettings
  chain: ModelItem[]
  now: number
  onCommit: (next: RoutingSettings, message?: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onCommit(addGroup(settings), '已新增模型分组')}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
        >
          + 新增模型分组
        </button>
        <span className="text-xs text-zinc-500">各组勾选即可参与全局 Priority 降序计算，组内模型按 Priority 排序</span>
      </div>
      {settings.groups.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          chain={chain}
          now={now}
          settings={settings}
          onCommit={onCommit}
        />
      ))}
    </div>
  )
}

function GroupCard({
  group,
  chain,
  now,
  settings,
  onCommit,
}: {
  group: ModelGroup
  chain: ModelItem[]
  now: number
  settings: RoutingSettings
  onCommit: (next: RoutingSettings, message?: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draftId, setDraftId] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftPriority, setDraftPriority] = useState(70)
  const [draftTimeout, setDraftTimeout] = useState(25)

  return (
    <section className={`rounded-lg border border-[#2a3140] bg-[#181c25] p-3 ${group.enabled ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="checkbox"
          checked={group.enabled}
          aria-label={`启用分组 ${group.name}`}
          onChange={() => onCommit(toggleGroupEnabled(settings, group.id))}
        />
        <input
          value={group.name}
          aria-label={`分组名称 ${group.name}`}
          onChange={(event) => onCommit(patchGroup(settings, group.id, { name: event.target.value }))}
          className="min-w-[180px] flex-1 rounded border border-transparent bg-transparent px-1 text-sm font-medium hover:border-[#323848]"
        />
        <label className="text-xs text-zinc-400">
          组 Priority
          <input
            type="number"
            min={1}
            max={100}
            value={group.priority}
            aria-label={`${group.name} 组优先级`}
            onChange={(event) =>
              onCommit(patchGroup(settings, group.id, { priority: clampPriority(Number(event.target.value)) }))
            }
            className="ml-1 w-16 rounded border border-[#323848] bg-[#0e1117] px-1 py-0.5 text-center"
          />
        </label>
        <span className="text-xs text-zinc-500">{group.models.length} 个模型</span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`确认删除模型分组 [${group.name}] 吗？`)) {
              onCommit(deleteGroup(settings, group.id), '已删除模型分组')
            }
          }}
          className="text-xs text-zinc-500 hover:text-red-300"
        >
          删除分组
        </button>
      </div>
      <input
        value={group.description || ''}
        placeholder="分组说明与级联意图..."
        aria-label={`${group.name} 说明`}
        onChange={(event) => onCommit(patchGroup(settings, group.id, { description: event.target.value }))}
        className="mt-2 w-full rounded border border-[#323848] bg-[#0e1117] px-2 py-1 text-xs text-zinc-300"
      />
      <div className="mt-3 space-y-2">
        {group.models.map((model) => {
          const winner = chain.find((item) => item.id === model.id)
          const overridden = winner && winner.sourceGroupId !== group.id && winner.priority > model.priority
          return (
            <ModelEditor
              key={model.id}
              model={model}
              now={now}
              note={overridden ? `被 ${winner.sourceGroupName} P:${winner.priority} 覆盖` : undefined}
              onToggle={() => onCommit(toggleModelEnabled(settings, model.id, group.id))}
              onPriority={(priority) => onCommit(setModelPriority(settings, model.id, priority))}
              onTimeout={(timeout) => onCommit(setModelTimeout(settings, model.id, timeout))}
              onDelete={() => onCommit(removeModel(settings, model.id, group.id), '已从分组移除模型')}
            />
          )
        })}
      </div>
      {adding ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={draftId}
            placeholder="模型 ID"
            aria-label="新组内模型 ID"
            onChange={(event) => setDraftId(event.target.value)}
            className="min-w-[180px] flex-1 rounded border border-[#323848] bg-[#0e1117] px-2 py-1 text-xs"
          />
          <input
            value={draftName}
            placeholder="显示名称"
            aria-label="新组内模型名称"
            onChange={(event) => setDraftName(event.target.value)}
            className="min-w-[140px] flex-1 rounded border border-[#323848] bg-[#0e1117] px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              const id = draftId.trim()
              if (!id) return
              onCommit(
                addModelToGroup(settings, group.id, {
                  id,
                  name: draftName.trim() || id,
                  priority: clampPriority(draftPriority),
                  ttftTimeout: clampTimeout(draftTimeout),
                  enabled: true,
                }),
                '已添加到分组',
              )
              setAdding(false)
              setDraftId('')
              setDraftName('')
            }}
            className="rounded bg-violet-600 px-2 py-1 text-xs text-white"
          >
            保存
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-xs text-zinc-400">
            取消
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-3 text-xs text-violet-300">
          + 添加组内模型
        </button>
      )}
      {adding && (
        <div className="mt-2 flex gap-3 text-xs text-zinc-400">
          <label>
            Priority
            <input
              type="number"
              value={draftPriority}
              aria-label="新组内模型优先级"
              onChange={(event) => setDraftPriority(Number(event.target.value))}
              className="ml-1 w-16 rounded border border-[#323848] bg-[#0e1117] px-1"
            />
          </label>
          <label>
            TTFT
            <input
              type="number"
              value={draftTimeout}
              aria-label="新组内模型超时"
              onChange={(event) => setDraftTimeout(Number(event.target.value))}
              className="ml-1 w-16 rounded border border-[#323848] bg-[#0e1117] px-1"
            />
            s
          </label>
        </div>
      )}
    </section>
  )
}

function StandaloneTab({
  settings,
  now,
  onCommit,
}: {
  settings: RoutingSettings
  now: number
  onCommit: (next: RoutingSettings, message?: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draftId, setDraftId] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftPriority, setDraftPriority] = useState(50)
  const [draftTimeout, setDraftTimeout] = useState(25)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setAdding((value) => !value)}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
        >
          {adding ? '收起添加' : '+ 新增独立模型'}
        </button>
        <span className="text-xs text-zinc-500">独立模型不属于任何组，启用时直接参与全局降级队列运算</span>
      </div>
      {adding && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#2a3140] bg-[#181c25] p-3">
          <input
            value={draftId}
            placeholder="模型 ID (如 obsidian/gpt-6.1-sol)"
            aria-label="新独立模型 ID"
            onChange={(event) => setDraftId(event.target.value)}
            className="min-w-[220px] flex-1 rounded border border-[#323848] bg-[#0e1117] px-2 py-1 text-xs"
          />
          <input
            value={draftName}
            placeholder="显示名称"
            aria-label="新独立模型名称"
            onChange={(event) => setDraftName(event.target.value)}
            className="min-w-[160px] flex-1 rounded border border-[#323848] bg-[#0e1117] px-2 py-1 text-xs"
          />
          <label className="text-xs text-zinc-400">
            Priority
            <input
              type="number"
              min={1}
              max={100}
              value={draftPriority}
              aria-label="新独立模型优先级"
              onChange={(event) => setDraftPriority(Number(event.target.value))}
              className="ml-1 w-16 rounded border border-[#323848] bg-[#0e1117] px-1"
            />
          </label>
          <label className="text-xs text-zinc-400">
            TTFT
            <input
              type="number"
              min={5}
              max={300}
              value={draftTimeout}
              aria-label="新独立模型超时"
              onChange={(event) => setDraftTimeout(Number(event.target.value))}
              className="ml-1 w-16 rounded border border-[#323848] bg-[#0e1117] px-1"
            />
            s
          </label>
          <button
            type="button"
            onClick={() => {
              const id = draftId.trim()
              if (!id) {
                return
              }
              if (settings.standaloneModels.some((model) => model.id === id)) return
              const model: ModelItem = {
                id,
                name: draftName.trim() || id,
                priority: clampPriority(draftPriority),
                ttftTimeout: clampTimeout(draftTimeout),
                enabled: true,
                tags: ['standalone'],
              }
              onCommit(
                {
                  ...settings,
                  standaloneModels: [...settings.standaloneModels, model].sort((a, b) => b.priority - a.priority),
                  activeStandaloneModelIds: [...new Set([...settings.activeStandaloneModelIds, id])],
                },
                `已添加独立模型 ${model.name}`,
              )
              setAdding(false)
              setDraftId('')
              setDraftName('')
            }}
            className="rounded bg-violet-600 px-2 py-1 text-xs text-white"
          >
            保存独立模型
          </button>
        </div>
      )}
      <div className="space-y-2">
        {settings.standaloneModels.map((model) => (
          <ModelEditor
            key={model.id}
            model={model}
            now={now}
            checked={model.enabled && settings.activeStandaloneModelIds.includes(model.id)}
            onToggle={() => onCommit(toggleStandalone(settings, model.id))}
            onPriority={(priority) => onCommit(setModelPriority(settings, model.id, priority))}
            onTimeout={(timeout) => onCommit(setModelTimeout(settings, model.id, timeout))}
            onDelete={() => onCommit(removeStandalone(settings, model.id), '已移除独立模型')}
          />
        ))}
      </div>
    </div>
  )
}

function SubagentTab({
  settings,
  onCommit,
}: {
  settings: RoutingSettings
  onCommit: (next: RoutingSettings, message?: string) => void
}) {
  const roles = Object.values(settings.subagents).sort((a, b) => {
    const ai = SUBAGENT_ORDER.indexOf(a.role)
    const bi = SUBAGENT_ORDER.indexOf(b.role)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[#2a3140] bg-[#181c25] p-3">
        <div className="mb-2 text-sm font-semibold">OpenCode 原生 Prometheus + Atlas 3 步日常流</div>
        <div className="grid gap-2 md:grid-cols-3">
          <Step n="1. 需求与计划" role="Prometheus (计划者)" text="绑定强推理模型，只读分析，产出任务清单。" />
          <Step n="2. 一键转交" role="Atlas (执行者)" text="切至代码模型改文件、跑测试、打勾。" />
          <Step n="3. 证据验收" role="Grok / Prometheus" text="只查验 exit code、测试报错与改动文件数，未通过则重改。" />
        </div>
      </div>
      {roles.map((agent) => (
        <article key={agent.role} className="rounded-lg border border-[#2a3140] bg-[#181c25] p-3">
          <div className="flex items-center gap-2">
            <span className="font-medium">{agent.name || agent.role}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                agent.readOnly ? 'bg-sky-500/15 text-sky-200' : 'bg-emerald-500/15 text-emerald-200'
              }`}
            >
              {agent.readOnly ? '只读 (无写权限)' : '完整读写'}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{agent.description}</p>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <span className="shrink-0 text-zinc-300">绑定模型/组：</span>
            <select
              aria-label={`${agent.name || agent.role} 绑定`}
              value={bindingValue(agent)}
              onChange={(event) => onCommit(bindSubagent(settings, agent.role, event.target.value))}
              className="min-w-0 flex-1 rounded border border-[#323848] bg-[#0e1117] px-2 py-1"
            >
              {settings.standaloneModels.map((model) => (
                <option key={model.id} value={`model:${model.id}`}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
        </article>
      ))}
    </div>
  )
}

function QueueTab({
  settings,
  chain,
  now,
  onCommit,
}: {
  settings: RoutingSettings
  chain: ModelItem[]
  now: number
  onCommit: (next: RoutingSettings, message?: string) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">实时复合模型队列 (Strictly Priority 降序排列)</div>
          <p className="mt-1 text-xs text-zinc-500">
            汇聚当前所有启用组与独立模型。按 Priority 权重自上而下逐级降级，遇 503 或超时秒切下一位。
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCommit(resetAllCircuitBreakers(settings), '已重置所有熔断')}
          className="shrink-0 rounded-md border border-[#323848] px-3 py-1.5 text-xs hover:bg-[#1c2230]"
        >
          重置所有熔断
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#2a3140]">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-[#181c25] text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">位次</th>
              <th className="px-3 py-2 font-medium">Priority 权重</th>
              <th className="px-3 py-2 font-medium">模型名</th>
              <th className="px-3 py-2 font-medium">TTFT 超时</th>
              <th className="px-3 py-2 font-medium">熔断状态</th>
              <th className="px-3 py-2 font-medium">故障注入测试</th>
            </tr>
          </thead>
          <tbody>
            {chain.map((model, index) => {
              const open = isModelCooling(model, now)
              const half = model.circuitBreaker?.state === 'half-open'
              return (
                <tr key={model.id} className="border-t border-[#2a3140]">
                  <td className="px-3 py-2">#{index + 1}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-violet-500/20 px-2 py-0.5 text-violet-100">{model.priority}</span>
                  </td>
                  <td className="px-3 py-2">{model.name}</td>
                  <td className="px-3 py-2">{model.ttftTimeout}s</td>
                  <td className="px-3 py-2">
                    {open ? (
                      <span className="text-amber-300">熔断冷却中 ({getModelRemainingSeconds(model, now)}s)</span>
                    ) : half ? (
                      <span className="text-sky-300">探测中 (Half-Open)</span>
                    ) : (
                      <span className="text-emerald-300">正常活跃</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        onCommit(recordFailure(settings, model.id, '503', Date.now()), `${model.name} 进入 60s 熔断`)
                      }
                      className="rounded border border-[#323848] px-2 py-1 hover:bg-[#1c2230]"
                    >
                      模拟 503 报错
                    </button>
                  </td>
                </tr>
              )
            })}
            {chain.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  队列为空
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SsotTab({
  sourcePath,
  jsonText,
  onChange,
  onCopy,
  onImport,
}: {
  sourcePath: string
  jsonText: string
  onChange: (value: string) => void
  onCopy: () => void
  onImport: () => void
}) {
  return (
    <div className="flex h-full min-h-[360px] flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">OpenCode 单一事实来源 (SSOT JSON)</div>
          <p className="mt-1 text-xs text-zinc-500">
            写入 {sourcePath || 'opencode-routing.json'}。导入前会校验 JSON。模型分组字段已停用，文件里原样保留。
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCopy} className="rounded border border-[#323848] px-3 py-1.5 text-xs">
            复制 JSON 配置
          </button>
          <button type="button" onClick={onImport} className="rounded bg-violet-600 px-3 py-1.5 text-xs text-white">
            从下方导入并生效
          </button>
        </div>
      </div>
      <textarea
        value={jsonText}
        aria-label="SSOT JSON"
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className="min-h-[320px] flex-1 rounded-lg border border-[#2a3140] bg-[#0e1117] p-3 font-mono text-xs text-zinc-200"
      />
    </div>
  )
}

function ModelEditor({
  model,
  now,
  note,
  checked,
  onToggle,
  onPriority,
  onTimeout,
  onDelete,
}: {
  model: ModelItem
  now: number
  note?: string
  checked?: boolean
  onToggle: () => void
  onPriority: (priority: number) => void
  onTimeout: (timeout: number) => void
  onDelete: () => void
}) {
  const enabled = checked ?? model.enabled
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#2a3140] bg-[#12151c] px-3 py-2 ${enabled ? '' : 'opacity-50'}`}>
      <label className="flex min-w-[220px] items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} aria-label={`启用 ${model.name}`} onChange={onToggle} />
        <span>
          {model.name} <span className="text-xs text-zinc-500">({model.id})</span>
        </span>
        {isModelCooling(model, now) && (
          <span className="text-xs text-amber-300">冷却中 ({getModelRemainingSeconds(model, now)}s)</span>
        )}
        {note && <span className="text-xs text-amber-400/80">{note}</span>}
      </label>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-400">Priority:</span>
        <input
          type="number"
          min={1}
          max={100}
          value={model.priority}
          aria-label={`${model.name} 优先级`}
          onChange={(event) => onPriority(clampPriority(Number(event.target.value)))}
          className="w-16 rounded border border-[#323848] bg-[#0e1117] px-1 py-0.5 text-center"
        />
        {[10, 1, -1, -10].map((delta) => (
          <button
            key={delta}
            type="button"
            onClick={() => onPriority(clampPriority(model.priority + delta))}
            className="rounded border border-[#323848] px-1.5 py-0.5 hover:bg-[#1c2230]"
          >
            {delta > 0 ? `+${delta}` : delta}
          </button>
        ))}
        <span className="text-zinc-400">TTFT:</span>
        <input
          type="number"
          min={5}
          max={300}
          value={model.ttftTimeout}
          aria-label={`${model.name} TTFT`}
          onChange={(event) => onTimeout(clampTimeout(Number(event.target.value)))}
          className="w-16 rounded border border-[#323848] bg-[#0e1117] px-1 py-0.5 text-center"
        />
        <span className="text-zinc-500">s</span>
        <button type="button" onClick={onDelete} aria-label={`删除 ${model.name}`} className="px-1 text-zinc-500 hover:text-red-300">
          ×
        </button>
      </div>
    </div>
  )
}

function Step({ n, role, text }: { n: string; role: string; text: string }) {
  return (
    <div className="rounded-md border border-[#2a3140] bg-[#12151c] p-2">
      <div className="text-[11px] font-semibold text-violet-300">{n}</div>
      <div className="text-xs font-medium">{role}</div>
      <div className="text-[11px] text-zinc-500">{text}</div>
    </div>
  )
}

function mapModels(settings: RoutingSettings, id: string, map: (model: ModelItem) => ModelItem): RoutingSettings {
  return {
    ...settings,
    groups: settings.groups.map((group) => ({ ...group, models: group.models.map((model) => (model.id === id ? map(model) : model)) })),
    standaloneModels: settings.standaloneModels.map((model) => (model.id === id ? map(model) : model)),
  }
}

function setModelPriority(settings: RoutingSettings, id: string, priority: number): RoutingSettings {
  const next = mapModels(settings, id, (model) => ({ ...model, priority }))
  return {
    ...next,
    standaloneModels: [...next.standaloneModels].sort((a, b) => b.priority - a.priority),
    groups: next.groups.map((group) => ({
      ...group,
      models: [...group.models].sort((a, b) => b.priority - a.priority),
    })),
  }
}

function setModelTimeout(settings: RoutingSettings, id: string, ttftTimeout: number): RoutingSettings {
  return mapModels(settings, id, (model) => ({ ...model, ttftTimeout }))
}

function toggleModelEnabled(settings: RoutingSettings, id: string, groupId: string | null): RoutingSettings {
  return {
    ...settings,
    groups: settings.groups.map((group) =>
      groupId && group.id !== groupId
        ? group
        : { ...group, models: group.models.map((model) => (model.id === id ? { ...model, enabled: !model.enabled } : model)) },
    ),
    standaloneModels:
      groupId === null
        ? settings.standaloneModels.map((model) => (model.id === id ? { ...model, enabled: !model.enabled } : model))
        : settings.standaloneModels,
  }
}

function toggleStandalone(settings: RoutingSettings, id: string): RoutingSettings {
  const active = new Set(settings.activeStandaloneModelIds)
  const enabling = !(settings.standaloneModels.find((model) => model.id === id)?.enabled && active.has(id))
  if (enabling) active.add(id)
  else active.delete(id)
  return {
    ...settings,
    activeStandaloneModelIds: [...active],
    standaloneModels: settings.standaloneModels.map((model) =>
      model.id === id ? { ...model, enabled: enabling } : model,
    ),
  }
}

function removeStandalone(settings: RoutingSettings, id: string): RoutingSettings {
  const selected = settings.selectedActiveTarget === `model:${id}` ? 'all-active' : settings.selectedActiveTarget
  return {
    ...settings,
    selectedActiveTarget: selected,
    standaloneModels: settings.standaloneModels.filter((model) => model.id !== id),
    activeStandaloneModelIds: settings.activeStandaloneModelIds.filter((item) => item !== id),
  }
}

function removeModel(settings: RoutingSettings, id: string, groupId: string): RoutingSettings {
  return {
    ...settings,
    groups: settings.groups.map((group) =>
      group.id === groupId ? { ...group, models: group.models.filter((model) => model.id !== id) } : group,
    ),
  }
}

function addModelToGroup(settings: RoutingSettings, groupId: string, model: ModelItem): RoutingSettings {
  return {
    ...settings,
    groups: settings.groups.map((group) => {
      if (group.id !== groupId || group.models.some((item) => item.id === model.id)) return group
      return { ...group, models: [...group.models, model].sort((a, b) => b.priority - a.priority) }
    }),
  }
}

function patchGroup(settings: RoutingSettings, groupId: string, patch: Partial<ModelGroup>): RoutingSettings {
  return {
    ...settings,
    groups: settings.groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
  }
}

function toggleGroupEnabled(settings: RoutingSettings, groupId: string): RoutingSettings {
  const group = settings.groups.find((item) => item.id === groupId)
  const enabled = !(group?.enabled ?? false)
  const active = settings.activeGroupIds.filter((id) => id !== groupId)
  if (enabled) active.push(groupId)
  return {
    ...settings,
    activeGroupIds: active,
    groups: settings.groups.map((item) => (item.id === groupId ? { ...item, enabled } : item)),
  }
}

/** @deprecated Groups stay in the file and are not offered in the panel. */
function addGroup(settings: RoutingSettings): RoutingSettings {
  const id = `group-${Date.now()}`
  const group: ModelGroup = {
    id,
    name: '新自定义分组',
    description: '阶梯优先级级联降级策略',
    priority: 50,
    enabled: true,
    strategy: 'priority-fallback',
    models: [],
  }
  return {
    ...settings,
    groups: [...settings.groups, group],
    activeGroupIds: [...settings.activeGroupIds, id],
  }
}

function deleteGroup(settings: RoutingSettings, groupId: string): RoutingSettings {
  const selected = settings.selectedActiveTarget === `group:${groupId}` ? 'all-active' : settings.selectedActiveTarget
  return {
    ...settings,
    selectedActiveTarget: selected,
    groups: settings.groups.filter((group) => group.id !== groupId),
    activeGroupIds: settings.activeGroupIds.filter((id) => id !== groupId),
  }
}

function normalizeSelection(settings: RoutingSettings): string {
  const selected = settings.selectedActiveTarget
  if (selected === 'all-active') return selected
  if (selected.startsWith('group:') || selected.startsWith('model:')) return selected
  if (settings.groups.some((group) => group.id === selected)) return `group:${selected}`
  if (settings.standaloneModels.some((model) => model.id === selected)) return `model:${selected}`
  return 'all-active'
}

function applyWorkflowSelection(settings: RoutingSettings, value: string): RoutingSettings {
  if (value === 'all-active') {
    return {
      ...settings,
      selectedActiveTarget: 'all-active',
      activeGroupIds: settings.groups.filter((group) => group.enabled).map((group) => group.id),
    }
  }
  if (value.startsWith('group:')) {
    return { ...settings, selectedActiveTarget: value, activeGroupIds: [value.slice('group:'.length)] }
  }
  return { ...settings, selectedActiveTarget: value }
}

function bindingValue(agent: SubagentBinding): string {
  if (agent.targetType && agent.targetId) return `${agent.targetType}:${agent.targetId}`
  if (agent.targetModelId) return `model:${agent.targetModelId}`
  return ''
}

function bindSubagent(settings: RoutingSettings, role: string, value: string): RoutingSettings {
  const splitAt = value.indexOf(':')
  const targetType = value.slice(0, splitAt) === 'group' ? 'group' : 'model'
  const targetId = value.slice(splitAt + 1)
  let targetModelId = targetId
  if (targetType === 'group') {
    const group = settings.groups.find((item) => item.id === targetId)
    const top = group ? [...group.models].sort((a, b) => b.priority - a.priority)[0] : undefined
    if (top) targetModelId = top.id
  }
  const current = settings.subagents[role]
  return {
    ...settings,
    subagents: {
      ...settings.subagents,
      [role]: {
        ...current,
        role,
        targetType,
        targetId,
        targetModelId,
        readOnly: current?.readOnly ?? false,
      },
    },
  }
}
