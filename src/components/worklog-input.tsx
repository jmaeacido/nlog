import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { FileText, FolderOpen, Plus, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  collectWorklogFilesFromDataTransfer,
  createPastedWorklogFile,
  filesToWorklogFiles,
  getProjectFolderLabel,
  type WorklogFile,
} from '@/lib/collect-worklog-files'
import { ProjectPathsPanel } from '@/components/project-paths-panel'
import { useInvoiceStore } from '@/store/invoice-store'
import { cn } from '@/lib/utils'

const PLACEHOLDER = `| Time | DESCRIPTION | QTY |
|---|---|---:|
| July 1, 2026, 3:13 PM – 3:23 PM | Java Lava — Task title, July 1, 2026. Work description here. | 0.17 Hours |`

type PendingAdd =
  | { kind: 'files'; files: File[] }
  | { kind: 'paste'; content: string }
  | { kind: 'worklogs'; worklogs: WorklogFile[]; needsFolder: boolean }

export function WorklogInput() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [pasteValue, setPasteValue] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null)
  const [projectFolderInput, setProjectFolderInput] = useState('')
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderValue, setEditingFolderValue] = useState('')

  const {
    worklogFiles,
    sourceSummaries,
    addWorklogFiles,
    removeWorklogFile,
    clearWorklogFiles,
    updateWorklogSourceFolder,
    isParsing,
  } = useInvoiceStore()

  const entryCountBySource = new Map(
    sourceSummaries.map((source) => [source.name, source.entryCount]),
  )

  const commitWorklogs = async (files: WorklogFile[]) => {
    await addWorklogFiles(files)
    toast.success(
      `Added ${files.length} file${files.length === 1 ? '' : 's'} to this invoice.`,
    )
  }

  const confirmPendingAdd = async () => {
    if (!pendingAdd) return
    const folder = projectFolderInput.trim()

    if (pendingAdd.kind === 'files') {
      const worklogs = await filesToWorklogFiles(pendingAdd.files, folder)
      await commitWorklogs(worklogs)
    } else if (pendingAdd.kind === 'paste') {
      await commitWorklogs([createPastedWorklogFile(pendingAdd.content, folder)])
    } else {
      const worklogs = folder
        ? pendingAdd.worklogs.map((file) =>
            file.sourceFolder ? file : {
              ...file,
              sourceFolder: folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''),
              sourcePath: `${folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}/${file.name}`,
            },
          )
        : pendingAdd.worklogs
      await commitWorklogs(worklogs)
    }

    setPendingAdd(null)
    setProjectFolderInput('')
  }

  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    if (files.length === 0) {
      toast.error('No markdown files found. Upload .md worklog files.')
      return
    }

    // Browsers do not expose folder paths for Add Files — ask for the project folder.
    setPendingAdd({ kind: 'files', files })
    setProjectFolderInput('')
  }

  const handleFolderInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    if (files.length === 0) {
      toast.error('No markdown files found. Upload .md worklog files.')
      return
    }

    const worklogs = await filesToWorklogFiles(files)
    await commitWorklogs(worklogs)
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const worklogFilesToAdd = await collectWorklogFilesFromDataTransfer(
      event.dataTransfer,
    )
    if (worklogFilesToAdd.length === 0) {
      toast.error('No markdown files found. Upload .md worklog files.')
      return
    }

    const missingFolder = worklogFilesToAdd.some((file) => !file.sourceFolder)
    if (missingFolder) {
      setPendingAdd({
        kind: 'worklogs',
        worklogs: worklogFilesToAdd,
        needsFolder: true,
      })
      setProjectFolderInput('')
      return
    }

    await commitWorklogs(worklogFilesToAdd)
  }

  const handleAddPaste = () => {
    if (!pasteValue.trim()) {
      toast.error('Paste a worklog table before adding.')
      return
    }

    setPendingAdd({ kind: 'paste', content: pasteValue })
    setProjectFolderInput('')
    setShowPaste(false)
  }

  const saveEditedFolder = async (id: string) => {
    await updateWorklogSourceFolder(id, editingFolderValue)
    setEditingFolderId(null)
    setEditingFolderValue('')
    toast.success('Project folder updated.')
  }

  const totalEntries = sourceSummaries.reduce(
    (sum, source) => sum + source.entryCount,
    0,
  )

  const pendingCount =
    pendingAdd?.kind === 'files'
      ? pendingAdd.files.length
      : pendingAdd?.kind === 'worklogs'
        ? pendingAdd.worklogs.length
        : pendingAdd
          ? 1
          : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Worklogs</CardTitle>
        <CardDescription>
          Add markdown worklogs from different projects and folders. All files
          are merged into one invoice.
        </CardDescription>
      </CardHeader>

      <ProjectPathsPanel
        onWorklogsLoaded={async (files) => {
          await addWorklogFiles(files)
        }}
      />

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => void handleDrop(event)}
        className={cn(
          'mb-4 flex min-h-32 flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          isDragging
            ? 'border-nlog-accent bg-blue-50'
            : 'border-nlog-border bg-slate-50',
        )}
      >
        <Upload className="mb-2 h-6 w-6 text-nlog-slate" />
        <p className="mb-1 text-sm font-medium text-nlog-navy">
          Drop markdown files or folders here
        </p>
        <p className="mb-4 text-xs text-nlog-slate">
          <span className="font-medium">Add Files</span> asks for the project
          folder. <span className="font-medium">Add Folder</span> detects it
          automatically.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="h-4 w-4" />
            Add Files
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderOpen className="h-4 w-4" />
            Add Folder
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowPaste((value) => !value)}
          >
            <FileText className="h-4 w-4" />
            Paste Worklog
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,text/markdown,text/plain"
          multiple
          className="hidden"
          onChange={(event) => void handleFileInput(event)}
        />
        <input
          ref={folderInputRef}
          type="file"
          accept=".md,text/markdown,text/plain"
          multiple
          className="hidden"
          onChange={(event) => void handleFolderInput(event)}
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        />
      </div>

      {pendingAdd && (
        <div className="mb-4 space-y-3 rounded-lg border border-nlog-border bg-slate-50 p-4">
          <div>
            <p className="text-sm font-medium text-nlog-navy">
              Project folder for {pendingCount} file
              {pendingCount === 1 ? '' : 's'}
            </p>
            <p className="mt-1 text-xs text-nlog-slate">
              Browsers hide the disk path for Add Files. Enter the project
              folder name so it shows on the worklog card (e.g.{' '}
              <span className="font-medium">Java Lava</span> or{' '}
              <span className="font-medium">Alchemydev CRM</span>).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="projectFolderPrompt">Project folder</Label>
            <Input
              id="projectFolderPrompt"
              value={projectFolderInput}
              onChange={(event) => setProjectFolderInput(event.target.value)}
              placeholder="e.g. Java Lava"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void confirmPendingAdd()
                }
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void confirmPendingAdd()}>
              {projectFolderInput.trim() ? 'Add with folder' : 'Add without folder'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPendingAdd(null)
                setProjectFolderInput('')
                if (pendingAdd.kind === 'paste') {
                  setPasteValue(pendingAdd.content)
                  setShowPaste(true)
                }
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {showPaste && (
        <div className="mb-4 space-y-3 rounded-lg border border-nlog-border p-4">
          <Textarea
            value={pasteValue}
            onChange={(event) => setPasteValue(event.target.value)}
            placeholder={PLACEHOLDER}
            className="font-mono text-xs"
            aria-label="Paste worklog markdown"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleAddPaste}>
              Continue
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowPaste(false)
                setPasteValue('')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {worklogFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-nlog-navy">
              {worklogFiles.length} file{worklogFiles.length === 1 ? '' : 's'} ·{' '}
              {totalEntries} entr{totalEntries === 1 ? 'y' : 'ies'}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void clearWorklogFiles()}
            >
              <Trash2 className="h-4 w-4" />
              Clear all
            </Button>
          </div>

          <ul className="space-y-2">
            {worklogFiles.map((file) => {
              const entryCount = entryCountBySource.get(file.sourcePath) ?? 0
              const folderLabel = file.sourceFolder
              const projectRoot = getProjectFolderLabel(file.sourceFolder)
              const isEditing = editingFolderId === file.id

              return (
                <li
                  key={file.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-nlog-border bg-white px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-nlog-navy">
                      {file.name}
                    </p>

                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <Input
                          value={editingFolderValue}
                          onChange={(event) =>
                            setEditingFolderValue(event.target.value)
                          }
                          placeholder="Project folder name"
                          aria-label={`Project folder for ${file.name}`}
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void saveEditedFolder(file.id)}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingFolderId(null)
                              setEditingFolderValue('')
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : folderLabel ? (
                      <>
                        <p className="mt-0.5 truncate text-xs font-medium text-nlog-navy/80">
                          From: {projectRoot}
                        </p>
                        {folderLabel !== projectRoot && (
                          <p
                            className="truncate text-xs text-nlog-slate"
                            title={folderLabel}
                          >
                            {folderLabel}
                          </p>
                        )}
                        <button
                          type="button"
                          className="mt-1 text-xs text-nlog-accent underline"
                          onClick={() => {
                            setEditingFolderId(file.id)
                            setEditingFolderValue(folderLabel)
                          }}
                        >
                          Edit folder
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="mt-0.5 text-xs text-nlog-slate">
                          From: Not set
                        </p>
                        <button
                          type="button"
                          className="mt-1 text-xs text-nlog-accent underline"
                          onClick={() => {
                            setEditingFolderId(file.id)
                            setEditingFolderValue('')
                          }}
                        >
                          Set project folder
                        </button>
                      </>
                    )}

                    <p className="mt-1 text-xs text-nlog-slate">
                      {entryCount} entr{entryCount === 1 ? 'y' : 'ies'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeWorklogFile(file.id)}
                    className="rounded p-2 text-nlog-slate hover:bg-slate-100"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {isParsing && (
        <p className="mt-3 text-sm text-nlog-slate">
          Parsing worklogs… Groq will repair messy tables when needed.
        </p>
      )}
    </Card>
  )
}
