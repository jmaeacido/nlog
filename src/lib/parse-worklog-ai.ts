import type { WorklogEntry } from './invoice-model'
import {
  parseWorklogMarkdown,
  type ParseError,
  type ParseResult,
  type SourceParseSummary,
  type WorklogSource,
} from './parse-worklog'
import { sortLineItemsChronologically } from './timeline'
import { normalizeAiEntries, requestWorklogEnhance } from './groq-client'

export interface AiParseMeta {
  usedAi: boolean
  notes: string[]
  enhancedSources: string[]
}

export interface AiParseResult extends ParseResult {
  ai: AiParseMeta
}

function shouldEnhanceSource(result: ParseResult, content: string): boolean {
  if (!content.trim()) return false
  if (result.errors.length > 0) return true
  if (result.entries.length === 0) return true
  return false
}

export async function parseMultipleWorklogsWithAi(
  sources: WorklogSource[],
): Promise<AiParseResult> {
  const merged: WorklogEntry[] = []
  const errors: ParseError[] = []
  const warnings: ParseError[] = []
  const sourceSummaries: SourceParseSummary[] = []
  const notes: string[] = []
  const enhancedSources: string[] = []
  let usedAi = false

  for (const source of sources) {
    const deterministic = await parseWorklogMarkdown(source.content)
    let entries = deterministic.entries
    let sourceErrors = deterministic.errors
    let sourceWarnings = deterministic.warnings

    if (shouldEnhanceSource(deterministic, source.content)) {
      try {
        const enhanced = await requestWorklogEnhance({
          markdown: source.content,
          sourceName: source.name,
          deterministicErrors: deterministic.errors.map((error) =>
            error.row ? `row ${error.row}: ${error.message}` : error.message,
          ),
        })

        const aiEntries = normalizeAiEntries(enhanced.entries)
        if (aiEntries.length > 0) {
          usedAi = true
          enhancedSources.push(source.name)
          entries = aiEntries
          sourceErrors = []
          sourceWarnings = [
            ...sourceWarnings,
            {
              message: `Groq repaired this worklog (${aiEntries.length} entr${aiEntries.length === 1 ? 'y' : 'ies'}).`,
            },
            ...deterministic.errors.map((error) => ({
              ...error,
              message: error.row
                ? `Recovered after deterministic error on row ${error.row}: ${error.message}`
                : `Recovered after deterministic error: ${error.message}`,
            })),
          ]
          notes.push(
            ...enhanced.notes.map((note) => `${source.name}: ${note}`),
          )
        } else {
          warnings.push({
            message: `${source.name}: Groq ran but returned no usable entries.`,
          })
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Groq enhance failed'
        warnings.push({
          message: `${source.name}: Groq enhance unavailable (${message}). Using deterministic parse.`,
        })
      }
    }

    merged.push(...entries)
    sourceSummaries.push({
      name: source.name,
      entryCount: entries.length,
    })
    errors.push(
      ...sourceErrors.map((error) => ({
        ...error,
        message: error.row
          ? `${source.name}, row ${error.row}: ${error.message}`
          : `${source.name}: ${error.message}`,
      })),
    )
    warnings.push(
      ...sourceWarnings.map((warning) => ({
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
    ai: {
      usedAi,
      notes,
      enhancedSources,
    },
  }
}
