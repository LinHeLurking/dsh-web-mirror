import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * Markdown rendering for untrusted session content.
 *
 * marked (GFM + hard line breaks) → DOMPurify sanitize → dangerouslySetInnerHTML.
 * The sanitize step is NOT optional: mirror payloads are raw session data and
 * may contain arbitrary markup. DOMPurify's default profile strips scripts,
 * event handlers, and unsafe URL schemes.
 */

// Links in mirrored content must never navigate the viewer away from the
// mirror in-place; force target=_blank + noopener at sanitize time.
// Registered once per module load (DOMPurify hooks are global).
let hooksInstalled = false
function installHooks(): void {
  if (hooksInstalled) return
  hooksInstalled = true
  // Guard: outside a DOM (SSR/test tooling) DOMPurify's export is an inert
  // factory — sanitize/addHook are absent (isSupported === false).
  if (typeof DOMPurify.addHook !== 'function') return
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

/** Escape-all fallback for non-DOM environments — output stays safe HTML. */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function renderMarkdown(src: string): string {
  installHooks()
  const html = marked.parse(src, { async: false, gfm: true, breaks: true })
  if (typeof DOMPurify.sanitize !== 'function') return escapeHtml(html)
  return DOMPurify.sanitize(html)
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(text), [text])
  return (
    <div
      className={className ? `md ${className}` : 'md'}
      // Sanitized above — sees installHooks()/renderMarkdown().
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
