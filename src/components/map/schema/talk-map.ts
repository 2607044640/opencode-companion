import { z } from "zod"

const CameraSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
})

const HotkeysSchema = z.object({
  "1": z.string().exactOptional(),
  "2": z.string().exactOptional(),
  "3": z.string().exactOptional(),
})

const GlobalSchema = z.object({
  camera: CameraSchema,
  hotkeys: HotkeysSchema,
})

const BoardSchema = z.object({
  cardIds: z.array(z.string()),
  groupIds: z.array(z.string()),
  camera: CameraSchema.exactOptional(),
})

const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

const CardSchema = z.object({
  cardId: z.string(),
  sessionId: z.string().exactOptional(),
  ghost: z.boolean(),
  label: z.string().exactOptional(),
  colorTag: z.string().exactOptional(),
  groupId: z.union([z.string(), z.null()]).exactOptional(),
  position: PositionSchema,
  directory: z.string(),
})

const GroupSchema = z.object({
  groupId: z.string(),
  title: z.string(),
  color: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  childCardIds: z.array(z.string()),
  createdAt: z.number(),
  directory: z.string(),
})

const EdgeKindSchema = z.union([
  z.literal("native"),
  z.literal("inject"),
  z.literal("link"),
])

const EdgeSchema = z.object({
  edgeId: z.string(),
  sourceCardId: z.string(),
  targetCardId: z.string(),
  kind: EdgeKindSchema,
  autoSync: z.boolean().default(false),
  comment: z.string(),
})

const DigestSchema = z.object({
  summary: z.string(),
  keyFindings: z.array(z.string()),
  nextStep: z.string(),
  inputHash: z.string(),
  updatedAt: z.number(),
})

const DEFAULT_CAMERA = { x: 0, y: 0, zoom: 1 } as const

export const TalkMapSchema = z.object({
  version: z.literal(1).default(1),
  global: GlobalSchema.default({
    camera: DEFAULT_CAMERA,
    hotkeys: {},
  }),
  boards: z.record(z.string(), BoardSchema).default({}),
  cards: z.record(z.string(), CardSchema).default({}),
  groups: z.record(z.string(), GroupSchema).default({}),
  edges: z.record(z.string(), EdgeSchema).default({}),
  digests: z.record(z.string(), DigestSchema).default({}),
})

export type TalkMap = z.infer<typeof TalkMapSchema>

export function emptyTalkMap(): TalkMap {
  return TalkMapSchema.parse({})
}
