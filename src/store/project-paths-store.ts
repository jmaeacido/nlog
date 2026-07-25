import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ProjectSourceKind = 'local' | 'onedrive'

export interface SavedProjectPath {
  id: string
  path: string
  label: string
  kind: ProjectSourceKind
  addedAt: string
}

interface ProjectPathsState {
  paths: SavedProjectPath[]
  addPath: (path: string) => SavedProjectPath | null
  removePath: (id: string) => void
  clearPaths: () => void
}

function normalizePathInput(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '')
}

function deriveLabel(projectPath: string): string {
  try {
    if (/^https?:\/\//i.test(projectPath)) {
      const url = new URL(projectPath)
      const parts = url.pathname.split('/').filter(Boolean)
      return parts[parts.length - 1] || url.hostname
    }
  } catch {
    // fall through
  }

  const normalized = projectPath.replace(/[\\/]+$/, '')
  const parts = normalized.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || projectPath
}

function detectKind(value: string): ProjectSourceKind {
  if (/^https?:\/\//i.test(value)) return 'onedrive'
  return 'local'
}

export const useProjectPathsStore = create<ProjectPathsState>()(
  persist(
    (set, get) => ({
      paths: [],
      addPath: (rawPath) => {
        const path = normalizePathInput(rawPath)
        if (!path) return null

        const existing = get().paths.find(
          (entry) => entry.path.toLowerCase() === path.toLowerCase(),
        )
        if (existing) return existing

        const entry: SavedProjectPath = {
          id: crypto.randomUUID(),
          path,
          label: deriveLabel(path),
          kind: detectKind(path),
          addedAt: new Date().toISOString(),
        }

        set((state) => ({
          paths: [entry, ...state.paths],
        }))

        return entry
      },
      removePath: (id) =>
        set((state) => ({
          paths: state.paths.filter((entry) => entry.id !== id),
        })),
      clearPaths: () => set({ paths: [] }),
    }),
    {
      name: 'nlog-project-paths',
      version: 2,
      migrate: (persisted) => {
        const state = persisted as { paths?: Array<SavedProjectPath & { kind?: ProjectSourceKind }> }
        return {
          paths: (state.paths ?? []).map((entry) => ({
            ...entry,
            kind:
              entry.kind ??
              (/^https?:\/\//i.test(entry.path) ? 'onedrive' : 'local'),
          })),
        }
      },
      partialize: (state) => ({ paths: state.paths }),
    },
  ),
)
