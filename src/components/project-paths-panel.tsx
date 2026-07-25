import { useMemo, useState } from 'react'
import {
  Cloud,
  FolderSearch,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/auth-provider'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  fetchOneDriveProjectLinks,
  pickDirectoryAndLoadWorklogs,
  scannedFilesToWorklogs,
  scanLocalProjectPaths,
  supportsDirectoryPicker,
} from '@/lib/project-paths'
import type { WorklogFile } from '@/lib/collect-worklog-files'
import { useProjectPathsStore } from '@/store/project-paths-store'

export function ProjectPathsPanel({
  onWorklogsLoaded,
}: {
  onWorklogsLoaded: (files: WorklogFile[]) => Promise<void>
}) {
  const { displayName } = useAuth()
  const paths = useProjectPathsStore((state) => state.paths)
  const addPath = useProjectPathsStore((state) => state.addPath)
  const removePath = useProjectPathsStore((state) => state.removePath)
  const [pathInput, setPathInput] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [isLinking, setIsLinking] = useState(false)

  const canUseDirectoryPicker = useMemo(() => supportsDirectoryPicker(), [])
  const isLocalHost =
    typeof window !== 'undefined' &&
    /^(localhost|127\.0\.0\.1|\[::1\]|.+\.test|.+\.local|.+\.localhost)(:\d+)?$/i.test(
      window.location.host,
    )

  const localPaths = paths.filter((entry) => entry.kind === 'local')
  const onedriveLinks = paths.filter((entry) => entry.kind === 'onedrive')

  const handleAddPath = () => {
    const chunks = pathInput
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)

    if (chunks.length === 0) {
      toast.error('Enter a local folder path or OneDrive share link.')
      return
    }

    let added = 0
    for (const chunk of chunks) {
      const entry = addPath(chunk)
      if (entry) added += 1
    }

    setPathInput('')
    toast.success(
      added === 1
        ? 'Saved 1 project source.'
        : `Saved ${added} project sources.`,
    )
  }

  const handleFetchPaths = async (onlyIds?: string[]) => {
    const selected = onlyIds
      ? paths.filter((entry) => onlyIds.includes(entry.id))
      : paths

    if (selected.length === 0) {
      toast.error('Add at least one path or OneDrive link first.')
      return
    }

    setIsScanning(true)
    try {
      const selectedLocal = selected.filter((entry) => entry.kind === 'local')
      const selectedOneDrive = selected.filter((entry) => entry.kind === 'onedrive')
      const worklogs: WorklogFile[] = []
      const errors: string[] = []

      if (selectedLocal.length > 0) {
        try {
          const results = await scanLocalProjectPaths(
            selectedLocal.map((entry) => entry.path),
          )
          worklogs.push(
            ...scannedFilesToWorklogs(results.flatMap((result) => result.files)),
          )
          for (const result of results) {
            if (result.error) errors.push(`${result.projectLabel}: ${result.error}`)
          }
        } catch (error) {
          errors.push(
            error instanceof Error
              ? error.message
              : 'Local path scan failed.',
          )
        }
      }

      if (selectedOneDrive.length > 0) {
        try {
          const results = await fetchOneDriveProjectLinks(
            selectedOneDrive.map((entry) => entry.path),
          )
          worklogs.push(
            ...scannedFilesToWorklogs(
              results.flatMap((result) => result.files),
            ),
          )
          for (const result of results) {
            if (result.error) errors.push(`${result.label}: ${result.error}`)
          }
        } catch (error) {
          errors.push(
            error instanceof Error
              ? error.message
              : 'OneDrive fetch failed.',
          )
        }
      }

      if (worklogs.length === 0) {
        toast.error(errors[0] || 'No markdown files found.')
        return
      }

      await onWorklogsLoaded(worklogs)
      toast.success(
        [
          `Loaded ${worklogs.length} markdown file${worklogs.length === 1 ? '' : 's'}.`,
          errors.length
            ? `${errors.length} source${errors.length === 1 ? '' : 's'} had issues.`
            : null,
        ]
          .filter(Boolean)
          .join(' '),
      )
    } finally {
      setIsScanning(false)
    }
  }

  const handleLinkFolder = async () => {
    setIsLinking(true)
    try {
      const worklogs = await pickDirectoryAndLoadWorklogs()
      if (worklogs.length === 0) {
        toast.error('No markdown files found in that folder.')
        return
      }
      await onWorklogsLoaded(worklogs)
      toast.success(
        `Loaded ${worklogs.length} markdown file${worklogs.length === 1 ? '' : 's'} from linked folder.`,
      )
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast.error(
        error instanceof Error ? error.message : 'Could not link folder.',
      )
    } finally {
      setIsLinking(false)
    }
  }

  return (
    <div className="mb-4 space-y-4 rounded-lg border border-nlog-border p-4">
      <div>
        <p className="text-sm font-medium text-nlog-navy">Project paths & OneDrive</p>
        <p className="mt-1 text-xs text-nlog-slate">
          Paste one parent OneDrive folder link (or several). NLog walks
          project subfolders like{' '}
          <span className="font-medium">alchemydev-crm</span>,{' '}
          <span className="font-medium">java-lava</span>, etc. and loads{' '}
          <span className="font-mono">.md</span> worklogs. Fetches use your
          signed-in Microsoft account
          {displayName ? (
            <>
              {' '}
              (<span className="font-medium">{displayName}</span>)
            </>
          ) : null}
          .
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="projectPathInput">Folder paths / OneDrive links</Label>
        <Textarea
          id="projectPathInput"
          value={pathInput}
          onChange={(event) => setPathInput(event.target.value)}
          placeholder={`https://1drv.ms/f/...\nC:\\laragon\\www\\alchemydev-crm`}
          className="min-h-28 font-mono text-xs"
        />
        <Button type="button" variant="outline" onClick={handleAddPath}>
          <Plus className="h-4 w-4" />
          Save sources
        </Button>
      </div>

      {paths.length > 0 && (
        <ul className="space-y-2">
          {paths.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-nlog-border bg-white px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-nlog-navy">
                  {entry.kind === 'onedrive' ? (
                    <Cloud className="h-3.5 w-3.5 shrink-0" />
                  ) : null}
                  {entry.label}
                </p>
                <p
                  className="truncate font-mono text-xs text-nlog-slate"
                  title={entry.path}
                >
                  {entry.path}
                </p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-nlog-slate">
                  {entry.kind === 'onedrive' ? 'OneDrive link' : 'Local path'}
                  {entry.kind === 'local' && !isLocalHost
                    ? ' · fetch needs local NLog'
                    : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isScanning}
                  onClick={() => void handleFetchPaths([entry.id])}
                  aria-label={`Fetch worklogs from ${entry.label}`}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <button
                  type="button"
                  onClick={() => removePath(entry.id)}
                  className="rounded p-2 text-nlog-slate hover:bg-slate-100"
                  aria-label={`Remove ${entry.label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={isScanning || paths.length === 0}
          onClick={() => void handleFetchPaths()}
        >
          <FolderSearch className="h-4 w-4" />
          {isScanning
            ? 'Fetching…'
            : onedriveLinks.length > 0 && localPaths.length === 0
              ? 'Fetch from OneDrive'
              : 'Fetch worklogs'}
        </Button>
        {canUseDirectoryPicker && (
          <Button
            type="button"
            variant="outline"
            disabled={isLinking}
            onClick={() => void handleLinkFolder()}
          >
            <Link2 className="h-4 w-4" />
            {isLinking ? 'Opening…' : 'Link Folder'}
          </Button>
        )}
      </div>
    </div>
  )
}
