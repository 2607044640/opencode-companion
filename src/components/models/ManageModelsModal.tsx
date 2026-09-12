import React, { useState, useMemo } from 'react'
import { X, Search, Plus, Cpu, Server } from 'lucide-react'
import type { ProviderInfo } from '../../types/opencode'
import { usePreferences } from '../../utils/preferences'
import { useI18n } from '../../utils/i18n'
import { isModelVisible } from '../../utils/model-filter'

export interface ManageModelsContentProps {
  providers: ProviderInfo[]
  onConnectProvider?: () => void
  showHeaderActions?: boolean
  onClose?: () => void
}

export const ManageModelsContent: React.FC<ManageModelsContentProps> = ({
  providers,
  onConnectProvider,
  showHeaderActions = true,
  onClose,
}) => {
  const { prefs, updatePreferences } = usePreferences()
  const { t } = useI18n()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredProviders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return providers

    return providers
      .map((p) => {
        const matchesProvider = (p.name || p.id).toLowerCase().includes(q)
        const matchedModels: Record<string, (typeof p.models)[string]> = {}

        Object.entries(p.models || {}).forEach(([mId, mObj]) => {
          const name = (mObj.name || mId).toLowerCase()
          if (matchesProvider || mId.toLowerCase().includes(q) || name.includes(q)) {
            matchedModels[mId] = mObj
          }
        })

        return {
          ...p,
          models: matchedModels,
        }
      })
      .filter((p) => Object.keys(p.models).length > 0)
  }, [providers, searchQuery])

  const handleToggleModel = (providerId: string, modelId: string, modelName?: string) => {
    const currentVis = prefs.modelVisibility || {}
    const isCurrentlyVisible = isModelVisible(
      providerId,
      modelId,
      modelName,
      prefs.modelVisibility,
      prefs.providerVisibility
    )
    const nextVis = {
      ...currentVis,
      [`${providerId}/${modelId}`]: !isCurrentlyVisible,
    }
    updatePreferences({ modelVisibility: nextVis })
  }

  const handleToggleProvider = (provider: ProviderInfo) => {
    const models = Object.entries(provider.models || {})
    const allOn = models.every(([mId, mObj]) =>
      isModelVisible(provider.id, mId, mObj.name, prefs.modelVisibility, prefs.providerVisibility)
    )

    const nextVis = { ...(prefs.modelVisibility || {}) }
    models.forEach(([mId]) => {
      nextVis[`${provider.id}/${mId}`] = !allOn
    })
    updatePreferences({ modelVisibility: nextVis })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs">
      {/* Header */}
      <div className="p-5 pb-3 border-b border-[#21242a]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{t.models.manageTitle}</h2>
            <p className="text-[11px] text-zinc-400 mt-1">{t.models.manageSubtitle}</p>
          </div>
          {showHeaderActions && (
            <div className="flex items-center gap-2">
              {onConnectProvider && (
                <button
                  type="button"
                  onClick={onConnectProvider}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f232b] hover:bg-[#282d38] border border-[#2c313a] text-zinc-200 hover:text-white transition-colors cursor-pointer text-xs font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t.models.connectProvider}</span>
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors cursor-pointer"
                  title={t.common.close}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Search Box */}
        <div className="relative mt-4">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.models.searchPlaceholder}
            autoFocus
            className="w-full pl-9 pr-3 py-2 bg-[#0d0f13] border border-[#272a32] focus:border-purple-500/80 focus:ring-1 focus:ring-purple-500/30 rounded-lg text-zinc-200 text-xs placeholder:text-zinc-500 focus:outline-none transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Providers & Models List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {filteredProviders.length === 0 ? (
          <div className="text-center py-10 text-zinc-500 text-xs">
            {t.models.noModelsFound}
          </div>
        ) : (
          filteredProviders.map((provider) => {
            const modelEntries = Object.entries(provider.models || {})
            const allModelsOn =
              modelEntries.length > 0 &&
              modelEntries.every(([mId, mObj]) =>
                isModelVisible(
                  provider.id,
                  mId,
                  mObj.name,
                  prefs.modelVisibility,
                  prefs.providerVisibility
                )
              )

            return (
              <div key={provider.id} className="space-y-2">
                {/* Provider Header with Master Toggle */}
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2 text-zinc-200 font-medium text-xs">
                    {provider.id === 'opencode' ? (
                      <Cpu className="w-3.5 h-3.5 text-zinc-400" />
                    ) : (
                      <Server className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                    <span>{provider.name || provider.id}</span>
                  </div>

                  {/* Master Provider Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleProvider(provider)}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      allModelsOn ? 'bg-purple-600' : 'bg-zinc-700/80'
                    }`}
                    title={`Toggle all ${provider.name || provider.id} models`}
                  >
                    <div
                      className={`w-3.5 h-3.5 bg-white rounded-full transition-transform absolute top-[3px] left-[3px] shadow-xs ${
                        allModelsOn ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Model Items */}
                <div className="space-y-1 pl-1">
                  {modelEntries.map(([mId, mObj]) => {
                    const isVisible = isModelVisible(
                      provider.id,
                      mId,
                      mObj.name,
                      prefs.modelVisibility,
                      prefs.providerVisibility
                    )

                    return (
                      <div
                        key={`${provider.id}-${mId}`}
                        className="flex items-center justify-between py-2 px-2.5 rounded-lg hover:bg-[#1a1d24] transition-colors"
                      >
                        <div className="flex flex-col">
                          <span className="text-zinc-200 font-medium text-xs">
                            {mObj.name || mId}
                          </span>
                          {mObj.name && mObj.name !== mId && (
                            <span className="text-[10px] text-zinc-500 font-mono">{mId}</span>
                          )}
                        </div>

                        {/* Individual Model Switch */}
                        <button
                          type="button"
                          onClick={() => handleToggleModel(provider.id, mId, mObj.name)}
                          className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                            isVisible ? 'bg-purple-600' : 'bg-zinc-700/80'
                          }`}
                          title={`Toggle ${mObj.name || mId}`}
                        >
                          <div
                            className={`w-3.5 h-3.5 bg-white rounded-full transition-transform absolute top-[3px] left-[3px] shadow-xs ${
                              isVisible ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export interface ManageModelsModalProps {
  isOpen: boolean
  onClose: () => void
  providers: ProviderInfo[]
  onConnectProvider?: () => void
}

export const ManageModelsModal: React.FC<ManageModelsModalProps> = ({
  isOpen,
  onClose,
  providers,
  onConnectProvider,
}) => {
  React.useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-modal="manage-models"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs select-none"
    >
      <div className="w-[620px] max-h-[85vh] bg-[#14161c] border border-[#272a31] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-xs">
        <ManageModelsContent
          providers={providers}
          onConnectProvider={onConnectProvider}
          showHeaderActions={true}
          onClose={onClose}
        />
      </div>
    </div>
  )
}
