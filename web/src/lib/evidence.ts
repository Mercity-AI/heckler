import type { TranscriptMessage, Violation } from './types'

/** Locate verbatim evidence quotes inside a message so they can be marked. */
export function findEvidence(content: string, violations: Violation[]): { start: number; end: number; v: Violation }[] {
  const hay = content.toLowerCase()
  const hits: { start: number; end: number; v: Violation }[] = []
  for (const v of violations) {
    const quote = v.evidence
      .trim()
      .replace(/^["“'‘]+|["”'’]+$/g, '')
      .replace(/(\.\.\.|…)$/, '')
      .trim()
    if (quote.length < 8) continue
    // evidence is sometimes trimmed by the evaluator; fall back to its opening words
    for (const probe of [quote, quote.slice(0, 80), quote.slice(0, 40)]) {
      const i = hay.indexOf(probe.toLowerCase())
      if (i >= 0) {
        hits.push({ start: i, end: i + probe.length, v })
        break
      }
    }
  }
  hits.sort((a, b) => a.start - b.start)
  // drop overlaps
  return hits.filter((h, i) => i === 0 || h.start >= hits[i - 1].end)
}

/** Turns (1-based) whose target reply contains quoted violation evidence. */
export function violationTurns(messages: TranscriptMessage[], violations: Violation[]): Set<number> {
  const turns = new Set<number>()
  if (!violations.length) return turns
  for (const m of messages) if (m.role === 'target' && findEvidence(m.content, violations).length) turns.add(m.turn)
  return turns
}
