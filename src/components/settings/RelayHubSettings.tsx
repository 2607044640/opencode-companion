import React, { useState } from 'react'
import {
  Coins,
  Plus,
  RefreshCw,
  ExternalLink,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react'
import {
  getRelayProviders,
  addRelayProvider,
  updateRelayProvider,
  deleteRelayProvider,
  fetchRelayQuota,
  formatBalance,
  syncRelayPresets,
  parseRelayIntake,
  type RelayProvider,
  DEFAULT_QUOTA_RATE,
  DEFAULT_CNY_RATE,
} from '../../utils/relay-billing'

interface RelayFormData {
  id?: string
  name: string
  baseUrl: string
  apiKey: string
  redeemUrl: string
  currency: 'USD' | 'CNY'
  quotaRate: number
  cnyRate: number
}

const PRESETS = [
  {
    label: 'TokenShop 站',
    name: 'TokenShop',
    baseUrl: 'https://tokenshop.homes',
    redeemUrl: 'https://tokenshop.homes/redeem',
    currency: 'USD' as const,
  },
  {
    label: '稳定中转 (Flash 3.7)',
    name: '稳定中转 (Flash 3.7)',
    baseUrl: 'https://xn--fiq104an1x80s.com',
    redeemUrl: 'https://xn--fiq104an1x80s.com/redeem',
    currency: 'USD' as const,
  },
  {
    label: '本地 New API 网关',
    name: 'Local New API',
    baseUrl: 'http://127.0.0.1:3000',
    redeemUrl: 'http://127.0.0.1:3000',
    currency: 'USD' as const,
  },
]

export const RelayHubSettings: React.FC = () => {
  const [providers, setProviders] = useState<RelayProvider[]>(() => getRelayProviders())
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  const [form, setForm] = useState<RelayFormData>({
    name: '',
    baseUrl: '',
    apiKey: '',
    redeemUrl: '',
    currency: 'CNY',
    quotaRate: DEFAULT_QUOTA_RATE,
    cnyRate: DEFAULT_CNY_RATE,
  })
  const [smartInput, setSmartInput] = useState('')

  const reload = () => {
    setProviders(getRelayProviders())
  }

  const handleSmartIntake = (text: string) => {
    setSmartInput(text)
    const parsed = parseRelayIntake(text)
    if (parsed) {
      setForm((prev) => ({
        ...prev,
        name: prev.name && prev.name !== '新中转站' ? prev.name : parsed.name,
        baseUrl: parsed.baseUrl || prev.baseUrl,
        redeemUrl: parsed.redeemUrl || prev.redeemUrl,
        apiKey: parsed.apiKey || prev.apiKey,
        currency: parsed.currency || prev.currency,
      }))
    }
  }

  const handleBaseUrlChange = (val: string) => {
    const parsed = parseRelayIntake(val)
    if (parsed && parsed.baseUrl) {
      setForm((prev) => ({
        ...prev,
        baseUrl: parsed.baseUrl,
        redeemUrl: prev.redeemUrl || parsed.redeemUrl,
        name: prev.name ? prev.name : parsed.name,
        apiKey: parsed.apiKey || prev.apiKey,
      }))
    } else {
      setForm((prev) => ({ ...prev, baseUrl: val }))
    }
  }

  const handleRedeemUrlChange = (val: string) => {
    const parsed = parseRelayIntake(val)
    if (parsed && parsed.baseUrl && !form.baseUrl) {
      setForm((prev) => ({
        ...prev,
        redeemUrl: val,
        baseUrl: parsed.baseUrl,
        name: prev.name ? prev.name : parsed.name,
      }))
    } else {
      setForm((prev) => ({ ...prev, redeemUrl: val }))
    }
  }

  const handleOpenAdd = () => {
    setForm({
      name: '',
      baseUrl: '',
      apiKey: '',
      redeemUrl: '',
      currency: 'CNY',
      quotaRate: DEFAULT_QUOTA_RATE,
      cnyRate: DEFAULT_CNY_RATE,
    })
    setSmartInput('')
    setEditingId(null)
    setShowKey(false)
    setTestResult(null)
    setIsEditing(true)
  }

  const handleOpenEdit = (p: RelayProvider) => {
    setForm({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      redeemUrl: p.redeemUrl || '',
      currency: p.currency,
      quotaRate: p.quotaRate ?? DEFAULT_QUOTA_RATE,
      cnyRate: p.cnyRate ?? DEFAULT_CNY_RATE,
    })
    setEditingId(p.id)
    setShowKey(false)
    setTestResult(null)
    setIsEditing(true)
  }

  const handleApplyPreset = (preset: typeof PRESETS[number]) => {
    setForm((prev) => ({
      ...prev,
      name: preset.name,
      baseUrl: preset.baseUrl,
      redeemUrl: preset.redeemUrl,
      currency: preset.currency,
    }))
  }

  const handleSave = async (andTest = false) => {
    if (!form.name.trim() || !form.baseUrl.trim()) {
      alert('请填写中转站名称与接口地址')
      return
    }

    let savedProvider: RelayProvider

    if (editingId) {
      updateRelayProvider(editingId, {
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim(),
        redeemUrl: form.redeemUrl.trim() || undefined,
        currency: form.currency,
        quotaRate: Number(form.quotaRate) || DEFAULT_QUOTA_RATE,
        cnyRate: Number(form.cnyRate) || DEFAULT_CNY_RATE,
      })
      savedProvider = getRelayProviders().find((p) => p.id === editingId)!
    } else {
      savedProvider = addRelayProvider({
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim(),
        redeemUrl: form.redeemUrl.trim() || undefined,
        currency: form.currency,
        quotaRate: Number(form.quotaRate) || DEFAULT_QUOTA_RATE,
        cnyRate: Number(form.cnyRate) || DEFAULT_CNY_RATE,
      })
    }

    reload()

    if (andTest && savedProvider) {
      await handleTestProvider(savedProvider)
    }

    setIsEditing(false)
    setEditingId(null)
  }

  const handleDelete = (id: string, name: string) => {
    if (confirm(`确定删除中转站 "${name}" 吗？`)) {
      deleteRelayProvider(id)
      reload()
    }
  }

  const handleTestProvider = async (p: RelayProvider) => {
    setTestingId(p.id)
    setTestResult(null)
    updateRelayProvider(p.id, { status: 'loading' })
    reload()

    try {
      const res = await fetchRelayQuota(p)
      if (res.ok) {
        updateRelayProvider(p.id, {
          balance: res.balance,
          totalQuota: res.totalQuota,
          usedQuota: res.usedQuota,
          isUnmetered: res.isUnmetered,
          note: res.note,
          status: 'ok',
          error: undefined,
          lastUpdated: Date.now(),
        })
        setTestResult({
          id: p.id,
          ok: true,
          message: res.isUnmetered
            ? `连接成功！中转节点正常运行 (${res.note || '点卡直连'})`
            : `连接成功！当前可用余额: ${formatBalance(res.balance, res.currency)}`,
        })
      } else {
        updateRelayProvider(p.id, {
          status: 'error',
          error: res.error || '连接失败',
        })
        setTestResult({
          id: p.id,
          ok: false,
          message: `连接失败: ${res.error || '未能获取额度'}`,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      updateRelayProvider(p.id, {
        status: 'error',
        error: msg,
      })
      setTestResult({
        id: p.id,
        ok: false,
        message: `测试异常: ${msg}`,
      })
    } finally {
      setTestingId(null)
      reload()
    }
  }

  const handleSyncPresets = async () => {
    setIsSyncing(true)
    setTestResult(null)
    try {
      const synced = await syncRelayPresets()
      setProviders(synced)
      for (const p of synced) {
        handleTestProvider(p)
      }
    } catch (err) {
      setTestResult({
        id: 'sync',
        ok: false,
        message: `同步预设失败: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header & Description */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#f0f6fc] flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            <span>中转站额度中心 (Relay Hub)</span>
          </h2>
          <p className="text-xs text-[#8b949e] mt-0.5">
            实时监视各第三方中转站/网关的账户余额、汇率与快捷充值兑换通道。
          </p>
        </div>

        {!isEditing && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleSyncPresets}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1f2430] hover:bg-[#282f3f] border border-[#2d3445] text-zinc-200 rounded-lg text-xs font-medium transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              title="从本地网关自动同步可用中转站"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
              <span>{isSyncing ? '同步中...' : '同步网关预设'}</span>
            </button>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>添加中转站</span>
            </button>
          </div>
        )}
      </div>

      {/* Inline Form: Add or Edit Station */}
      {isEditing && (
        <div className="p-4 rounded-xl border border-[#2b303c] bg-[#161820] space-y-4 shadow-lg animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-[#232731]">
            <span className="text-xs font-semibold text-zinc-200">
              {editingId ? '编辑中转站配置' : '新建中转站'}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500">快捷预设:</span>
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="px-2 py-0.5 text-[10px] rounded bg-[#20242f] text-zinc-300 hover:bg-[#2a303e] hover:text-white transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Smart Auto-Intake Banner */}
          <div className="p-3 rounded-lg border border-dashed border-blue-500/40 bg-blue-500/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-blue-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>智能识别导入 (粘贴包含 /redeem、/keys 链接与 API Key 自动解析)</span>
              </span>
              <span className="text-[10px] text-zinc-500">免手动编辑各字段</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="直接粘贴如: [稳定中转](https://xn--fiq104an1x80s.com/redeem) sk-example-..."
                value={smartInput}
                onChange={(e) => handleSmartIntake(e.target.value)}
                className="flex-1 bg-[#111317] border border-[#272b35] rounded-lg px-3 py-1.5 text-zinc-200 font-mono text-[11px] focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => handleSmartIntake(smartInput)}
                className="px-3 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-medium transition-colors shrink-0 cursor-pointer"
              >
                自动识别
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-zinc-400 mb-1">中转站名称 *</label>
              <input
                type="text"
                placeholder="例如: TokenShop 核心站"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-[#111317] border border-[#272b35] rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">接口基地址 (Base URL) *</label>
              <input
                type="text"
                placeholder="例如: https://api.tokenshop.homes 或粘贴 /redeem 链接"
                value={form.baseUrl}
                onChange={(e) => handleBaseUrlChange(e.target.value)}
                className="w-full bg-[#111317] border border-[#272b35] rounded-lg px-3 py-1.5 text-zinc-200 font-mono text-[11px] focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-zinc-400 mb-1">API Key / 查询令牌</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={form.apiKey}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val.includes('http') || val.includes('\n')) {
                      handleSmartIntake(val)
                    } else {
                      setForm({ ...form, apiKey: val })
                    }
                  }}
                  className="w-full bg-[#111317] border border-[#272b35] rounded-lg pl-3 pr-9 py-1.5 text-zinc-200 font-mono text-[11px] focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-2 text-zinc-500 hover:text-zinc-300"
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                支持标准 OpenAI 格式、New API 用户令牌或 API Key，用于向余额接口进行 Bearer 认证。
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-zinc-400 mb-1">充值 / 兑换地址 (Redeem URL)</label>
              <input
                type="text"
                placeholder="例如: https://tokenshop.homes/redeem"
                value={form.redeemUrl}
                onChange={(e) => handleRedeemUrlChange(e.target.value)}
                className="w-full bg-[#111317] border border-[#272b35] rounded-lg px-3 py-1.5 text-zinc-200 font-mono text-[11px] focus:outline-none focus:border-blue-500"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                配置后，在右上角顶栏下拉卡片中将显示直达“充值/兑换”按钮。
              </p>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">显示货币</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, currency: 'CNY' })}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    form.currency === 'CNY'
                      ? 'bg-[#252834] border-blue-500 text-white'
                      : 'border-[#272b35] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  人民币 (CNY ¥)
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, currency: 'USD' })}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    form.currency === 'USD'
                      ? 'bg-[#252834] border-blue-500 text-white'
                      : 'border-[#272b35] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  美元 (USD $)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">
                USD/CNY 汇率换算比
              </label>
              <input
                type="number"
                step="0.1"
                value={form.cnyRate}
                onChange={(e) => setForm({ ...form, cnyRate: parseFloat(e.target.value) || DEFAULT_CNY_RATE })}
                className="w-full bg-[#111317] border border-[#272b35] rounded-lg px-3 py-1.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#232731]">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-[#1e222b] transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              className="px-3 py-1.5 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors shadow-sm"
            >
              保存并测试
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors shadow-sm"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* Test Result Banner */}
      {testResult && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in duration-200 ${
            testResult.ok
              ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/30 border-rose-800/60 text-rose-300'
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{testResult.message}</span>
        </div>
      )}

      {/* Configured Providers List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            已配置中转站 ({providers.length})
          </h3>
          {providers.length > 0 && (
            <span className="text-[11px] text-zinc-500">
              数据保存在本地浏览器中，绝不上报云端
            </span>
          )}
        </div>

        {providers.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-[#2b303c] bg-[#14161c] text-center space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full bg-[#1b1f28] flex items-center justify-center text-zinc-400">
              <Coins className="w-5 h-5 text-amber-400/70" />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-zinc-200">暂无中转站</div>
              <div className="text-[11px] text-zinc-500 max-w-sm mx-auto leading-relaxed">
                点击右上角“添加中转站”或使用快捷预设快速接入，即可在顶栏实时掌握余额。
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    handleApplyPreset(preset)
                    setIsEditing(true)
                  }}
                  className="px-2.5 py-1 text-xs rounded-lg border border-[#2e3442] bg-[#1c202a] text-zinc-300 hover:bg-[#252a37] hover:text-white transition-colors"
                >
                  接入 {preset.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {providers.map((p) => {
              const isItemTesting = testingId === p.id || p.status === 'loading'
              const isItemError = p.status === 'error'

              return (
                <div
                  key={p.id}
                  className="p-4 rounded-xl border border-[#21242b] bg-[#151820] hover:border-zinc-700 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  {/* Left info */}
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isItemError
                            ? 'bg-rose-500'
                            : isItemTesting
                            ? 'bg-amber-400 animate-pulse'
                            : 'bg-emerald-400'
                        }`}
                      />
                      <span className="text-xs font-semibold text-zinc-200">{p.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#1e222c] text-zinc-400">
                        {p.currency}
                      </span>
                    </div>

                    <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-2 truncate">
                      <span className="truncate max-w-[200px]" title={p.baseUrl}>
                        {p.baseUrl}
                      </span>
                      {p.apiKey && (
                        <span className="text-zinc-600">
                          (Key: {p.apiKey.slice(0, 7)}...{p.apiKey.slice(-4)})
                        </span>
                      )}
                    </div>

                    {isItemError && p.error && (
                      <div className="text-[10px] text-rose-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{p.error}</span>
                      </div>
                    )}
                  </div>

                  {/* Right balance & actions */}
                  <div className="flex items-center gap-3 shrink-0 justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-[#1e222c]">
                    <div className="text-right">
                      <div className="text-sm font-mono font-bold text-emerald-400">
                        {formatBalance(p.balance, p.currency)}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {p.lastUpdated
                          ? `更新于 ${new Date(p.lastUpdated).toLocaleTimeString()}`
                          : '未测试'}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {p.redeemUrl && (
                        <a
                          href={p.redeemUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-zinc-400 hover:text-blue-400 hover:bg-[#1d222d] rounded-lg transition-colors"
                          title="打开充值/兑换页面"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => handleTestProvider(p)}
                        disabled={isItemTesting}
                        className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#1d222d] rounded-lg transition-colors"
                        title="测试连接并刷新余额"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isItemTesting ? 'animate-spin text-amber-400' : ''}`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEdit(p)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-[#1d222d] rounded-lg transition-colors"
                        title="编辑配置"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(p.id, p.name)}
                        className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-[#1d222d] rounded-lg transition-colors"
                        title="删除此中转站"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
