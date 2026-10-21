// mod/types/index.d.ts
// The Pass state contract: checklist projection types and the session state keys the mod owns under the bytheslice plugin.

/** One slice row: its `N.M` id, its name, and whether the checklist marks it done. */
export type PassSlice = { id: string; name: string; done: boolean }

/** One pie (Prep counts as Pie 1, Foundations) with its review mode and its slices in checklist order. */
export type PassPie = {
  n: number
  name: string
  review: 'boundary' | 'continuous'
  done: boolean
  slices: PassSlice[]
}

/** Which shape the checklist file has: nested v5 pies, a flat v4 stage table, or neither. */
export type PassLayout = 'pie' | 'stage' | 'empty'

/** The parsed checklist. A flat v4 file has `pies: []` and `layout: 'stage'`. */
export type PassChecklist = {
  pies: PassPie[]
  prep: { done: number; total: number } | null
  layout: PassLayout
}

declare module 'claude-code' {
  interface PluginState {
    bytheslice: {
      /** The parsed checklist, or null when the file is missing or not yet read. */
      'pass.checklist': PassChecklist | null
      /** When the checklist was last read, epoch milliseconds; 0 before the first read. */
      'pass.loadedAt': number
      /** True when the engine is older than the Pass supports; the mod then stays inert. */
      'pass.limited': boolean
      /** The current git branch of the session's directory, or null when git gave none. */
      'pass.branch': string | null
    }
  }
}
