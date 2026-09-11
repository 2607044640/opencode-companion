import type { Dispatch, SetStateAction } from "react"
import { bindHotkey, type Digit } from "../groups/hotkeys"
import type { TalkMap } from "../schema/talk-map"
import { BlueprintActionMenu, type BlueprintMenuState } from "./BlueprintActionMenu"
import type { TalkMapClient } from "../opencode/client"
import { MapChrome } from "./map-chrome"
import type { ViewState } from "./map-interactions"
import { rubberBandOverlayStyle, type RubberBand } from "./rubber-band"

export type HotkeyMenu = {
  readonly groupId: string
  readonly x: number
  readonly y: number
}

export function MapOverlays(props: {
  readonly hideChrome: boolean | undefined
  readonly view: ViewState
  readonly toast: string | undefined
  readonly band: RubberBand | undefined
  readonly hotkeyMenu: HotkeyMenu | undefined
  readonly blueprintMenu?: BlueprintMenuState
  readonly client?: TalkMapClient
  readonly newCardId?: () => string
  readonly onRetry: () => void
  readonly onDirectory: (directory: string) => void
  readonly persistMap: (map: TalkMap) => void
  readonly setView: Dispatch<SetStateAction<ViewState>>
  readonly setToast?: Dispatch<SetStateAction<string | undefined>>
  readonly setHotkeyMenu: Dispatch<SetStateAction<HotkeyMenu | undefined>>
  readonly setBlueprintMenu?: Dispatch<SetStateAction<BlueprintMenuState | undefined>>
  readonly onAutoLayout?: () => void
}) {
  return (
    <>
      {!props.hideChrome && (
        <MapChrome
          view={props.view}
          toast={props.toast}
          onRetry={props.onRetry}
          onDirectory={props.onDirectory}
          onAutoLayout={props.onAutoLayout}
        />
      )}
      {props.band !== undefined ? (
        <div className="talk-map__band" style={rubberBandOverlayStyle(props.band)} />
      ) : null}
      {props.view.kind === "unreachable" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0c0d0e]/85 z-20 gap-3 text-zinc-400 select-none">
          <p className="text-xs">无法连接到 OpenCode 后端 (127.0.0.1:5001)</p>
          <button
            type="button"
            onClick={props.onRetry}
            className="px-3 py-1.5 text-xs bg-[#1a1d24] hover:bg-[#242933] text-zinc-200 rounded border border-[#2e3440] transition-colors"
          >
            重新连接
          </button>
        </div>
      ) : null}
      {props.hotkeyMenu !== undefined ? (
        <div
          className="talk-map__hotkey-menu"
          style={{ left: props.hotkeyMenu.x, top: props.hotkeyMenu.y }}
          data-testid="bind-hotkey-menu"
        >
          {(["1", "2", "3"] as const).map((digit: Digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => {
                const menu = props.hotkeyMenu
                if (menu === undefined) {
                  return
                }
                props.setView((current) => {
                  if (current.kind !== "ready") {
                    return current
                  }
                  const nextMap = bindHotkey(current.map, digit, menu.groupId)
                  props.persistMap(nextMap)
                  return { ...current, map: nextMap }
                })
                props.setHotkeyMenu(undefined)
              }}
            >
              Bind Ctrl+{digit}
            </button>
          ))}
        </div>
      ) : null}
      {props.blueprintMenu !== undefined && props.client && props.newCardId && props.setToast ? (
        <BlueprintActionMenu
          menu={props.blueprintMenu}
          view={props.view}
          client={props.client}
          newCardId={props.newCardId}
          persistMap={props.persistMap}
          setView={props.setView}
          setToast={props.setToast}
          onClose={() => props.setBlueprintMenu?.(undefined)}
        />
      ) : null}
    </>
  )
}
