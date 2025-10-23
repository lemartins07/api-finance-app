import PDFParser from 'pdf2json'

export interface Pdf2JsonTextRun {
  T: string
  S?: number
  TS?: number[]
  RA?: number | string
}

export interface Pdf2JsonTextItem {
  x: number
  y: number
  w: number
  sw: number
  A?: string
  R: Pdf2JsonTextRun[]
}

export interface Pdf2JsonPage {
  Width: number
  Height: number
  PageNumber?: number
  Texts: Pdf2JsonTextItem[]
  [key: string]: unknown
}

export interface Pdf2JsonMeta {
  PDFFormatVersion?: string
  PDFFileName?: string
  [key: string]: unknown
}

export interface Pdf2JsonDocument {
  Meta?: Pdf2JsonMeta
  Pages: Pdf2JsonPage[]
  [key: string]: unknown
}

export class Pdf2JsonExtractor {
  async extract(buffer: Buffer): Promise<Pdf2JsonDocument> {
    return new Promise((resolve, reject) => {
      const parser = new PDFParser()

      const handleError = (error: unknown) => {
        parser.removeAllListeners()
        if (error instanceof Error) {
          reject(error)
          return
        }
        reject(new Error(`Erro ao processar PDF: ${String(error)}`))
      }

      parser.on('pdfParser_dataError', handleError)

      parser.on('pdfParser_dataReady', (pdfData: unknown) => {
        parser.removeAllListeners()
        resolve(pdfData as Pdf2JsonDocument)
      })

      try {
        parser.parseBuffer(buffer)
      } catch (error) {
        handleError(error)
      }
    })
  }
}
