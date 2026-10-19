import type { TranscriptMessage, Violation } from './types'

export interface EvidenceHit {
  start: number
  end: number
  v: Violation
  /** Index of `v` in the violations list it came from. */
  i: number
}

/**
 * Lower-cases and flattens text for matching, keeping a map back to the original offsets. Evaluators
 * quote "verbatim" but drop markdown (**bold**), straighten quotes and dashes, and reflow whitespace,
 * so the raw strings rarely match character for character.
 */
function normalise(text: string): { s: string; map: number[] } {
  let s = ''
  const map: number[] = []
  let space = false
  for (let i = 0; i < text.length; i++) {
    let ch = text[i]
    if (ch === '*' || ch === '`' || ch === '_' || ch === '#') continue
    if (/\s/.test(ch)) {
      if (space || !s.length) continue
      space = true
      ch = ' '
    } else {
      space = false
      ch = ch
        .toLowerCase()
        .replace(/[‘’‛′]/g, "'")
        .replace(/[“”„″]/g, '"')
        .replace(/[–—−]/g, '-')
      if (ch === '…') {
        for (const c of '...') {
          s += c
          map.push(i)
        }
        continue
      }
    }
    s += ch
    map.push(i)
  }
  return { s, map }
}

/** The pieces of a quote worth searching for, longest-signal first. */
function probes(evidence: string): string[] {
  const q = normalise(evidence)
    .s.trim()
    .replace(/^["'\s]+|["'\s]+$/g, '')
  if (q.length < 6) return []
  // "first part ... second part": the evaluator elided the middle; try each fragment
  const parts = q
    .split(/\s*(?:\.\.\.|\[\.\.\.\])\s*/)
    .map((p) => p.replace(/^["'\s]+|["'\s]+$/g, ''))
    .filter((p) => p.length >= 12)
    .sort((a, b) => b.length - a.length)
  const out = [q, ...parts]
  for (const p of [q, ...parts]) out.push(p.slice(0, 80), p.slice(0, 40))
  return [...new Set(out.filter((p) => p.length >= 12 || p === q))]
}

/** Locate each violation's quoted evidence inside a message, as original-text offsets. */
export function findEvidence(content: string, violations: Violation[]): EvidenceHit[] {
  if (!violations.length) return []
  const hay = normalise(content)
  const hits: EvidenceHit[] = []
  violations.forEach((v, i) => {
    for (const probe of probes(v.evidence)) {
      const at = hay.s.indexOf(probe)
      if (at < 0) continue
      const start = hay.map[at]
      const end = hay.map[at + probe.length - 1] + 1
      hits.push({ start, end, v, i })
      return
    }
  })
  hits.sort((a, b) => a.start - b.start)
  // drop overlaps (two violations quoting the same sentence keep the first)
  return hits.filter((h, k) => k === 0 || h.start >= hits[k - 1].end)
}

/** Index of the first target message that quotes violation `i`, or -1 when the quote can't be placed. */
export function evidenceMessageIndex(messages: TranscriptMessage[], violations: Violation[], i: number): number {
  const v = violations[i]
  if (!v) return -1
  return messages.findIndex((m) => m.role === 'target' && findEvidence(m.content, [v]).length > 0)
}

/** Turns (1-based) whose target reply contains quoted violation evidence. */
export function violationTurns(messages: TranscriptMessage[], violations: Violation[]): Set<number> {
  const turns = new Set<number>()
  if (!violations.length) return turns
  for (const m of messages) if (m.role === 'target' && findEvidence(m.content, violations).length) turns.add(m.turn)
  return turns
}
