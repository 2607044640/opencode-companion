import { ReactFlowProvider } from "@xyflow/react"
import { MapCanvas } from "./MapCanvas"
import type { MapAppProps } from "./map-app-types"

export type { MapAppDeps, MapAppProps, MatchedSessionCard } from "./map-app-types"
export { MapCanvas } from "./MapCanvas"

export function MapApp(props: MapAppProps = {}) {
  return (
    <ReactFlowProvider>
      <MapCanvas {...props} />
    </ReactFlowProvider>
  )
}
