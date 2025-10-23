import type {
  Pdf2JsonDocument,
  Pdf2JsonPage,
  Pdf2JsonTextItem,
  Pdf2JsonTextRun,
} from './Pdf2JsonExtractor'

export interface NormalizedTextChunk {
  page: number
  text: string
  x: number
  y: number
  width: number
  spacing: number
}

export interface NormalizedTextLine {
  page: number
  y: number
  text: string
  chunks: NormalizedTextChunk[]
}

export interface PdfTextNormalizerConfig {
  yTolerance?: number
  spaceThreshold?: number
}

export class PdfTextNormalizer {
  private readonly yTolerance: number
  private readonly spaceThreshold: number

  constructor(config?: PdfTextNormalizerConfig) {
    this.yTolerance = config?.yTolerance ?? 2
    this.spaceThreshold = config?.spaceThreshold ?? 1.5
  }

  normalize(document: Pdf2JsonDocument): NormalizedTextLine[] {
    const lines: NormalizedTextLine[] = []

    document.Pages.forEach((page, pageIndex) => {
      const chunks = this.flattenPage(page, pageIndex)
      const grouped = this.groupChunksByLine(chunks)
      lines.push(...grouped)
    })

    return lines
  }

  private flattenPage(page: Pdf2JsonPage, pageIndex: number): NormalizedTextChunk[] {
    const chunks: NormalizedTextChunk[] = []

    for (const textItem of page.Texts ?? []) {
      const text = this.decodeTextItem(textItem)
      if (!text) continue

      chunks.push({
        page: pageIndex + 1,
        text,
        x: textItem.x,
        y: textItem.y,
        width: textItem.w,
        spacing: textItem.sw,
      })
    }

    return chunks.sort((a, b) => {
      if (a.y === b.y) return a.x - b.x
      return a.y - b.y
    })
  }

  private decodeTextItem(textItem: Pdf2JsonTextItem): string | null {
    if (!Array.isArray(textItem.R)) return null

    const parts: string[] = []

    for (const run of textItem.R) {
      const text = this.decodeRun(run)
      if (text) {
        parts.push(text)
      }
    }

    const combined = parts.join('')
    return combined.trim().length > 0 ? combined : null
  }

  private decodeRun(run: Pdf2JsonTextRun): string | null {
    if (!run?.T) return null
    try {
      return decodeURIComponent(run.T)
    } catch {
      return run.T
    }
  }

  private groupChunksByLine(chunks: NormalizedTextChunk[]): NormalizedTextLine[] {
    const lines: NormalizedTextLine[] = []

    let currentLine: NormalizedTextLine | null = null

    for (const chunk of chunks) {
      if (
        !currentLine ||
        chunk.page !== currentLine.page ||
        Math.abs(chunk.y - currentLine.y) > this.yTolerance
      ) {
        currentLine = {
          page: chunk.page,
          y: chunk.y,
          text: '',
          chunks: [],
        }
        lines.push(currentLine)
      }

      const lastChunk = currentLine.chunks[currentLine.chunks.length - 1]
      const needsSpace =
        lastChunk &&
        chunk.x - (lastChunk.x + lastChunk.width) > this.spaceThreshold

      currentLine.chunks.push(chunk)

      if (currentLine.text && needsSpace) {
        currentLine.text = `${currentLine.text} ${chunk.text}`
      } else {
        currentLine.text = `${currentLine.text}${chunk.text}`
      }

      currentLine.y = currentLine.chunks.reduce((sum, item) => sum + item.y, 0) /
        currentLine.chunks.length
    }

    return lines.map((line) => ({
      ...line,
      text: line.text.trim(),
    }))
  }
}
