export interface OneDriveWorklogFile {
  name: string
  sourcePath: string
  sourceFolder: string | null
  content: string
  shareUrl: string
}

export interface OneDriveFetchResult {
  link: string
  label: string
  files: OneDriveWorklogFile[]
  skipped: string[]
  error?: string
}

function encodeSharingUrl(url: string): string {
  const bytes = new TextEncoder().encode(url)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  const base64 = btoa(binary)
    .replace(/=+$/g, '')
    .replace(/\//g, '_')
    .replace(/\+/g, '-')
  return `u!${base64}`
}

export function isOneDriveShareUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    const host = url.hostname.toLowerCase()
    return (
      host === '1drv.ms' ||
      host.endsWith('onedrive.live.com') ||
      host.endsWith('sharepoint.com') ||
      host.includes('onedrive') ||
      host.includes('sharepoint')
    )
  } catch {
    return false
  }
}

type DriveItem = {
  id?: string
  name?: string
  folder?: unknown
  file?: unknown
  size?: number
  parentReference?: { driveId?: string; path?: string; name?: string }
  '@content.downloadUrl'?: string
  '@microsoft.graph.downloadUrl'?: string
  children?: DriveItem[]
}

function authHeaders(accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Prefer: 'redeemSharingLink',
    Accept: 'application/json',
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }
  return headers
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(
      `OneDrive request failed (${response.status}): ${detail.slice(0, 280)}`,
    )
  }
  return response.json()
}

async function getSharedDriveItem(
  shareId: string,
  accessToken?: string,
): Promise<DriveItem> {
  const headers = authHeaders(accessToken)

  if (accessToken) {
    return (await fetchJson(
      `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem?$expand=children`,
      { headers },
    )) as DriveItem
  }

  try {
    return (await fetchJson(
      `https://api.onedrive.com/v1.0/shares/${shareId}/root?expand=children`,
      { headers },
    )) as DriveItem
  } catch (anonymousError) {
    try {
      return (await fetchJson(
        `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem?$expand=children`,
        { headers },
      )) as DriveItem
    } catch {
      throw new Error(
        `${anonymousError instanceof Error ? anonymousError.message : 'Anonymous OneDrive access failed'}. Sign in with Microsoft to fetch modern OneDrive / SharePoint links.`,
      )
    }
  }
}

async function listSharedChildren(
  shareId: string,
  item: DriveItem,
  rootDriveId: string | undefined,
  accessToken?: string,
): Promise<DriveItem[]> {
  if (Array.isArray(item.children) && item.children.length > 0) {
    return item.children
  }

  const headers = authHeaders(accessToken)
  const itemId = item.id
  if (!itemId) return []

  const driveId = item.parentReference?.driveId || rootDriveId

  if (accessToken && driveId) {
    const payload = (await fetchJson(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/children?$top=200`,
      { headers },
    )) as { value?: DriveItem[] }
    return payload.value ?? []
  }

  if (accessToken) {
    try {
      const payload = (await fetchJson(
        `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem/children?$top=200`,
        { headers },
      )) as { value?: DriveItem[] }
      return payload.value ?? []
    } catch {
      // fall through
    }
  }

  try {
    const payload = (await fetchJson(
      `https://api.onedrive.com/v1.0/shares/${shareId}/items/${itemId}/children`,
      { headers },
    )) as { value?: DriveItem[] }
    return payload.value ?? []
  } catch {
    return []
  }
}

async function downloadSharedContent(
  shareId: string,
  item: DriveItem,
  rootDriveId: string | undefined,
  accessToken?: string,
): Promise<string> {
  const direct =
    item['@content.downloadUrl'] || item['@microsoft.graph.downloadUrl']
  if (direct) {
    const response = await fetch(direct)
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`)
    }
    return response.text()
  }

  const headers = authHeaders(accessToken)

  if (accessToken && item.id) {
    const driveId = item.parentReference?.driveId || rootDriveId
    const contentUrl = driveId
      ? `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${item.id}/content`
      : `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem/content`

    const response = await fetch(contentUrl, {
      headers,
      redirect: 'follow',
    })
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`)
    }
    return response.text()
  }

  if (!item.id) {
    const response = await fetch(
      `https://api.onedrive.com/v1.0/shares/${shareId}/root/content`,
      { headers, redirect: 'follow' },
    )
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`)
    }
    return response.text()
  }

  const response = await fetch(
    `https://api.onedrive.com/v1.0/shares/${shareId}/items/${item.id}/content`,
    { headers, redirect: 'follow' },
  )
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`)
  }
  return response.text()
}

function isMarkdownName(name: string | undefined): boolean {
  return Boolean(name?.toLowerCase().endsWith('.md'))
}

function isFolderItem(item: DriveItem): boolean {
  return Boolean(item.folder) || (!item.file && !isMarkdownName(item.name))
}

/** First path segment becomes the project name (e.g. alchemydev-crm). */
function projectPaths(relativeDir: string, fallbackLabel: string) {
  const parts = relativeDir.split('/').filter(Boolean)
  const project = parts[0] || fallbackLabel
  const nested = parts.slice(1).join('/')
  return { project, nested }
}

async function collectMarkdownFromItem(
  shareId: string,
  item: DriveItem,
  shareUrl: string,
  rootLabel: string,
  rootDriveId: string | undefined,
  relativeDir: string,
  files: OneDriveWorklogFile[],
  skipped: string[],
  depth: number,
  accessToken?: string,
): Promise<void> {
  if (depth > 8 || files.length >= 120) return

  const name = item.name || 'item'

  if (isFolderItem(item) && !isMarkdownName(name)) {
    const children = await listSharedChildren(
      shareId,
      item,
      rootDriveId,
      accessToken,
    )

    for (const child of children) {
      // Root share folder itself is not part of the project path.
      const nextRelative =
        depth === 0
          ? relativeDir
          : relativeDir
            ? `${relativeDir}/${name}`
            : name

      await collectMarkdownFromItem(
        shareId,
        child,
        shareUrl,
        rootLabel,
        rootDriveId,
        nextRelative,
        files,
        skipped,
        depth + 1,
        accessToken,
      )
    }
    return
  }

  if (!isMarkdownName(name)) {
    if (item.file) skipped.push(name)
    return
  }

  try {
    if ((item.size ?? 0) > 1_500_000) {
      skipped.push(`${name} (too large)`)
      return
    }

    const content = await downloadSharedContent(
      shareId,
      item,
      rootDriveId,
      accessToken,
    )
    const { project, nested } = projectPaths(relativeDir, rootLabel)
    const sourceFolder = nested ? `${project}/${nested}` : project
    const sourcePath = nested
      ? `${project}/${nested}/${name}`
      : `${project}/${name}`

    files.push({
      name,
      sourcePath,
      sourceFolder,
      content,
      shareUrl,
    })
  } catch (error) {
    skipped.push(
      `${name}: ${error instanceof Error ? error.message : 'download failed'}`,
    )
  }
}

function labelFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] || parsed.hostname
  } catch {
    return 'OneDrive'
  }
}

export async function fetchOneDriveWorklogsFromLinks(
  links: string[],
  accessToken?: string,
): Promise<OneDriveFetchResult[]> {
  const unique = [...new Set(links.map((link) => link.trim()).filter(Boolean))]
  const results: OneDriveFetchResult[] = []

  for (const link of unique.slice(0, 12)) {
    const label = labelFromUrl(link)
    const skipped: string[] = []

    if (!isOneDriveShareUrl(link)) {
      results.push({
        link,
        label,
        files: [],
        skipped,
        error: 'Not a recognized OneDrive / SharePoint share link.',
      })
      continue
    }

    try {
      // Encode the short 1drv.ms URL (resolved redirect URLs are too long for the API).
      const shareId = encodeSharingUrl(link)
      const root = await getSharedDriveItem(shareId, accessToken)
      const files: OneDriveWorklogFile[] = []
      const rootLabel = root.name || label
      const rootDriveId = root.parentReference?.driveId

      await collectMarkdownFromItem(
        shareId,
        root,
        link,
        rootLabel,
        rootDriveId,
        '',
        files,
        skipped,
        0,
        accessToken,
      )

      const projects = [
        ...new Set(
          files
            .map((file) => file.sourceFolder?.split('/')[0])
            .filter(Boolean),
        ),
      ]

      results.push({
        link,
        label:
          projects.length > 1
            ? `${rootLabel} (${projects.length} projects)`
            : projects[0] || rootLabel,
        files,
        skipped,
        error:
          files.length === 0
            ? accessToken
              ? 'No .md files found in this shared folder (including subfolders).'
              : 'No .md files found. Sign in with Microsoft (required for modern OneDrive links).'
            : undefined,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not fetch this OneDrive link.'
      results.push({
        link,
        label,
        files: [],
        skipped,
        error: accessToken
          ? message
          : `${message} Sign in with Microsoft, then fetch again.`,
      })
    }
  }

  return results
}
