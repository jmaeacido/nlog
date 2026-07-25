import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import type { WorklogEntry } from './invoice-model'
import { withWorklogIdentity } from './invoice-model'
import { sortLineItemsChronologically } from './timeline'

export interface ParseError {
  row?: number
  message: string
}

export interface ParseResult {
  entries: WorklogEntry[]
  errors: ParseError[]
  warnings: ParseError[]
  sources: SourceParseSummary[]
}

export interface WorklogSource {
  name: string
  content: string
}

export interface SourceParseSummary {
  name: string
  entryCount: number
}

const REQUIRED_HEADERS = ['time', 'description', 'qty']

export async function parseWorklogMarkdown(markdown: string): Promise<ParseResult> {
  const errors: ParseError[] = []
  const warnings: ParseError[] = []
  const entries: WorklogEntry[] = []

  if (!markdown.trim()) {
    return { entries, errors, warnings, sources: [] }
  }

  const tree = remark().use(remarkGfm).parse(markdown)
  const table = findWorklogTable(tree)

  if (!table) {
    errors.push({
      message: 'No worklog table found. Expected columns: Time | DESCRIPTION | QTY',
    })
    return { entries, errors, warnings, sources: [] }
  }

  const [headerRow, ...dataRows] = table
  const columnMap = mapColumns(headerRow)

  if (!columnMap) {
    errors.push({
      message: 'Table headers must include Time, DESCRIPTION, and QTY columns.',
    })
    return { entries, errors, warnings, sources: [] }
  }

  const seen = new Set<string>()

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2
    const time = cellText(row[columnMap.time])
    const description = cellText(row[columnMap.description])
    const qtyRaw = cellText(row[columnMap.qty])

    if (!description) {
      errors.push({ row: rowNumber, message: 'Description is required.' })
      return
    }

    const qtyHours = parseHours(qtyRaw)
    if (qtyHours <= 0) {
      errors.push({
        row: rowNumber,
        message: `Invalid quantity "${qtyRaw}". Expected format like "0.17 Hours".`,
      })
      return
    }

    const project = extractProject(description)
    const signature = `${time}|${description}|${qtyHours}`

    if (seen.has(signature)) {
      warnings.push({
        row: rowNumber,
        message: 'Duplicate row detected and included.',
      })
    } else {
      seen.add(signature)
    }

    entries.push(
      withWorklogIdentity({
        time,
        description,
        qtyHours,
        project,
        originalQtyHours: qtyHours,
      }),
    )
  })

  return { entries, errors, warnings, sources: [] }
}

export async function parseMultipleWorklogs(
  sources: WorklogSource[],
): Promise<ParseResult> {
  const merged: WorklogEntry[] = []
  const errors: ParseError[] = []
  const warnings: ParseError[] = []
  const sourceSummaries: SourceParseSummary[] = []

  for (const source of sources) {
    const result = await parseWorklogMarkdown(source.content)
    merged.push(...result.entries)
    sourceSummaries.push({
      name: source.name,
      entryCount: result.entries.length,
    })
    errors.push(
      ...result.errors.map((error) => ({
        ...error,
        message: error.row
          ? `${source.name}, row ${error.row}: ${error.message}`
          : `${source.name}: ${error.message}`,
      })),
    )
    warnings.push(
      ...result.warnings.map((warning) => ({
        ...warning,
        message: warning.row
          ? `${source.name}, row ${warning.row}: ${warning.message}`
          : `${source.name}: ${warning.message}`,
      })),
    )
  }

  return {
    entries: sortLineItemsChronologically(merged),
    errors,
    warnings,
    sources: sourceSummaries,
  }
}

function findWorklogTable(tree: unknown): string[][] | null {
  if (!tree || typeof tree !== 'object' || !('children' in tree)) {
    return null
  }

  const children = (tree as { children: unknown[] }).children

  for (const child of children) {
    if (!child || typeof child !== 'object' || (child as { type?: string }).type !== 'table') {
      continue
    }

    const tableNode = child as {
      children: Array<{
        children: Array<{ children?: Array<{ value?: string }> }>
      }>
    }

    const rows = tableNode.children.map((row) =>
      row.children.map((cell) => cellTextFromCell(cell)),
    )

    if (rows.length === 0) continue

    const header = rows[0].map((value) => value.toLowerCase().trim())
    const hasRequired = REQUIRED_HEADERS.every((name) => header.includes(name))

    if (hasRequired) {
      return rows
    }
  }

  return null
}

function mapColumns(headerRow: string[]): { time: number; description: number; qty: number } | null {
  const normalized = headerRow.map((value) => value.toLowerCase().trim())
  const time = normalized.indexOf('time')
  const description = normalized.indexOf('description')
  const qty = normalized.indexOf('qty')

  if (time === -1 || description === -1 || qty === -1) {
    return null
  }

  return { time, description, qty }
}

function cellTextFromCell(cell: unknown): string {
  return collectNodeText(cell).replace(/\s+/g, ' ').trim()
}

function collectNodeText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const value = node as {
    value?: string
    children?: unknown[]
  }
  if (typeof value.value === 'string') return value.value
  if (!value.children) return ''
  return value.children.map((child) => collectNodeText(child)).join('')
}

function cellText(value: string | undefined): string {
  return (value ?? '').trim()
}

function parseHours(value: string): number {
  const match = value.match(/([\d.]+)/)
  if (!match) return 0
  const hours = Number.parseFloat(match[1])
  return Number.isFinite(hours) ? hours : 0
}

function extractProject(description: string): string {
  const parts = description.split('—')
  if (parts.length > 1) {
    return parts[0].trim()
  }

  const dashParts = description.split(' - ')
  if (dashParts.length > 1) {
    return dashParts[0].trim()
  }

  return 'General'
}
