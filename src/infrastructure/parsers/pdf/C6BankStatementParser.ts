import { performance } from 'node:perf_hooks'

import { CreditCardStatement, Transaction } from '../../../domain/entities/CreditCardStatement'
import type { LocalStatementParserResult } from './LocalStatementParser'
import { Pdf2JsonExtractor } from './Pdf2JsonExtractor'
import {
  NormalizedTextChunk,
  NormalizedTextLine,
  PdfTextNormalizer,
} from './PdfTextNormalizer'

const AMOUNT_REGEX = /-?\d{1,3}(?:\.\d{3})*,\d{2}$/
const DATE_CHUNK_REGEX = /^(\d{1,2})\s+([a-zç]{3,})$/i
const SUBTOTAL_REGEX = /Subtotal\s+deste\s+cartão\s+R\$\s*([\d.,]+)/i
const VALUE_WITH_CURRENCY_REGEX = /R\$\s*([\d.,]+)/i

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  janeiro: '01',
  fev: '02',
  fevereiro: '02',
  mar: '03',
  março: '03',
  marco: '03',
  abr: '04',
  abril: '04',
  mai: '05',
  maio: '05',
  jun: '06',
  junho: '06',
  jul: '07',
  julho: '07',
  ago: '08',
  agosto: '08',
  set: '09',
  setembro: '09',
  out: '10',
  outubro: '10',
  nov: '11',
  novembro: '11',
  dez: '12',
  dezembro: '12',
}

export interface C6BankStatementParserConfig {
  fallbackCurrency?: string
  minimumTransactions?: number
}

interface ParsedHeaderResult {
  cardholder?: string
  closingDate?: string | null
  dueDate?: string | null
  invoiceNumber?: string | null
  currency?: string
  totalAmount?: number | null
  minimumPayment?: number | null
  year?: number
  closingMonth?: number
}

interface CardBlock {
  section: 'principal' | 'adicionais'
  cardName: string
  cardholder?: string
  lastDigits?: string
  cardType?: string | null
  expectedSubtotal: number | null
  rawSubtotalText: string | null
  transactions: Transaction[]
}

export class C6BankStatementParser {
  private readonly extractor: Pdf2JsonExtractor
  private readonly normalizer: PdfTextNormalizer
  private readonly fallbackCurrency: string
  private readonly minimumTransactions: number

  constructor(config?: C6BankStatementParserConfig) {
    this.extractor = new Pdf2JsonExtractor()
    this.normalizer = new PdfTextNormalizer()
    this.fallbackCurrency = config?.fallbackCurrency ?? 'BRL'
    this.minimumTransactions = config?.minimumTransactions ?? 3
  }

  async parse(buffer: Buffer): Promise<LocalStatementParserResult> {
    const totalStart = performance.now()

    const pdfStart = performance.now()
    const pdf = await this.extractor.extract(buffer)
    const pdfEnd = performance.now()

    const normalizeStart = performance.now()
    const lines = this.normalizer.normalize(pdf)
    const normalizeEnd = performance.now()

    const headerStart = performance.now()
    const header = this.extractHeader(lines)
    const headerEnd = performance.now()

    const transactionsStart = performance.now()
    const cardBlocks = this.extractCardBlocks(lines, header)
    const allTransactions = cardBlocks.flatMap((block) => block.transactions)
    const transactionsEnd = performance.now()

    if (allTransactions.length < this.minimumTransactions) {
      return {
        statement: null,
        lines,
        pdf,
        metrics: {
          pdfExtractionMs: +(pdfEnd - pdfStart).toFixed(2),
          normalizationMs: +(normalizeEnd - normalizeStart).toFixed(2),
          headerDetectionMs: +(headerEnd - headerStart).toFixed(2),
          transactionDetectionMs: +(transactionsEnd - transactionsStart).toFixed(2),
          totalMs: +(performance.now() - totalStart).toFixed(2),
        },
      }
    }

    const totalAmount = header.totalAmount ?? this.extractInvoiceTotal(lines)
    const minimumPayment = header.minimumPayment ?? this.extractMinimumPayment(lines)

    const statement: CreditCardStatement = {
      cardholder: header.cardholder ?? null,
      closingDate: header.closingDate ?? null,
      dueDate: header.dueDate ?? null,
      invoiceNumber: header.invoiceNumber ?? null,
      currency: header.currency ?? this.fallbackCurrency,
      totalAmount,
      minimumPayment,
      transactions: allTransactions.map((tx) => ({
        ...tx,
        currency: tx.currency ?? header.currency ?? this.fallbackCurrency,
      })),
      rawTextPath: null,
      metadata: {
        parser: 'local:c6-bank',
        source: 'pdf2json',
        lineCount: lines.length,
        cardSummaries: cardBlocks.map((block) => {
          const signedTotal = Number(
            block.transactions.reduce((acc, tx) => acc + tx.amount, 0).toFixed(2),
          )
          const absoluteTotal = Number(Math.abs(signedTotal).toFixed(2))
          return {
            section: block.section,
            cardName: block.cardName,
            cardholder: block.cardholder,
            lastDigits: block.lastDigits,
            cardType: block.cardType,
            expectedSubtotal: block.expectedSubtotal,
            computedSubtotal: absoluteTotal,
            subtotalDifference:
              block.expectedSubtotal !== null
                ? Number((absoluteTotal - block.expectedSubtotal).toFixed(2))
                : null,
            transactionCount: block.transactions.length,
          }
        }),
      },
    }

    return {
      statement,
      lines,
      pdf,
      metrics: {
        pdfExtractionMs: +(pdfEnd - pdfStart).toFixed(2),
        normalizationMs: +(normalizeEnd - normalizeStart).toFixed(2),
        headerDetectionMs: +(headerEnd - headerStart).toFixed(2),
        transactionDetectionMs: +(transactionsEnd - transactionsStart).toFixed(2),
        totalMs: +(performance.now() - totalStart).toFixed(2),
      },
    }
  }

  private extractHeader(lines: NormalizedTextLine[]): ParsedHeaderResult {
    const result: ParsedHeaderResult = { currency: 'BRL' }

    for (const line of lines) {
      const text = line.text
      if (!text) continue

      if (!result.cardholder) {
        const cardholderMatch = text.match(/LEANDRO\s+AZEVEDO\s+MARTINS/i)
        if (cardholderMatch) {
          result.cardholder = cardholderMatch[0].trim()
        }
      }

      if (!result.closingDate) {
        const closingMatch = text.match(/até\s+(\d{2}[/-]\d{2}(?:[/-]\d{2,4})?)/i)
        if (closingMatch) {
          result.closingDate = this.parseDateValue(closingMatch[1])
          result.year = this.extractYear(result.closingDate)
          result.closingMonth = this.extractMonth(result.closingDate)
        }
      }

      if (!result.dueDate) {
        const dueMatch = text.match(/Vencimento:\s*([^|\s].*?)(?:Débito|Valor|$)/i)
        if (dueMatch) {
          const parsed = this.parseDateValue(dueMatch[1], result.year)
          if (parsed) {
            result.dueDate = parsed
            result.year = result.year ?? this.extractYear(parsed)
          }
        }
      }

      if (!result.totalAmount) {
        const totalMatch = text.match(/Valor da fatura:\s*R\$\s*([\d.,]+)/i)
        if (totalMatch) {
          result.totalAmount = this.parseCurrency(totalMatch[1])
        }
      }

      if (!result.minimumPayment) {
        const minimumMatch = text.match(/Pagamento mínimo\s*(?:ou parcial)?\s*R\$\s*([\d.,]+)/i)
        if (minimumMatch) {
          result.minimumPayment = this.parseCurrency(minimumMatch[1])
        }
      }

      if (!result.invoiceNumber) {
        const invoiceMatch = text.match(/NOSSO NÚMERO\s*(\d{6,})/i)
        if (invoiceMatch) {
          result.invoiceNumber = invoiceMatch[1].trim()
        }
      }
    }

    return result
  }

  private extractCardBlocks(
    lines: NormalizedTextLine[],
    header: ParsedHeaderResult,
  ): CardBlock[] {
    const blocks: CardBlock[] = []
    let currentBlock: CardBlock | null = null
    let currentSection: CardBlock['section'] = 'principal'
    let collectingLines: NormalizedTextLine[] = []

    const finalizeBlock = () => {
      if (!currentBlock) return
      currentBlock.transactions = this.extractTransactionsFromLines(
        collectingLines,
        header.year,
        header.closingMonth,
      )
      blocks.push(currentBlock)
      currentBlock = null
      collectingLines = []
    }

    for (const line of lines) {
      const text = line.text
      if (!text) continue

      if (/Transações dos cartões adicionais/i.test(text)) {
        currentSection = 'adicionais'
        continue
      }

      if (/Transações do cartão principal/i.test(text)) {
        currentSection = 'principal'
        continue
      }

      const subtotalMatch = text.match(SUBTOTAL_REGEX)
      if (subtotalMatch) {
        finalizeBlock()

        const amount = this.parseCurrency(subtotalMatch[1])
        const { cardName, cardholder, lastDigits, cardType } = this.parseCardHeader(line)

        currentBlock = {
          section: currentSection,
          cardName,
          cardholder,
          lastDigits,
          cardType,
          expectedSubtotal: amount,
          rawSubtotalText: subtotalMatch[0],
          transactions: [],
        }
        collectingLines = []
        continue
      }

      if (currentBlock) {
        if (/^Valores em reais/i.test(text)) {
          continue
        }
        collectingLines.push(line)
      }
    }

    finalizeBlock()
    return blocks
  }

  private extractTransactionsFromLines(
    lines: NormalizedTextLine[],
    fallbackYear?: number,
    closingMonth?: number,
  ): Transaction[] {
    const transactions: Transaction[] = []

    for (const line of lines) {
      const groups = this.splitLineIntoTransactionChunks(line)

      for (const group of groups) {
        if (group.length < 3) continue
        const [dateChunk, ...rest] = group
        const amountChunk = rest[rest.length - 1]
        const descriptionChunks = rest.slice(0, -1)

        const dateText = dateChunk.text.trim()
        const amountText = amountChunk.text.trim()

        if (!AMOUNT_REGEX.test(amountText)) continue
        const description = this.buildDescription(descriptionChunks)
        if (!description) continue

        const date = this.parseStatementDate(dateText, fallbackYear, closingMonth)
        const amount = this.parseCurrency(amountText)
        if (amount === null) continue

        const signedAmount = this.normalizeAmountSign(description, amount)

        transactions.push({
          date,
          description,
          amount: signedAmount,
          currency: this.fallbackCurrency,
          category: null,
          metadata: {
            sourceChunks: group.map((chunk) => ({
              text: chunk.text,
              x: chunk.x,
              y: chunk.y,
            })),
          },
        })
      }
    }

    return transactions
  }

  private splitLineIntoTransactionChunks(line: NormalizedTextLine): NormalizedTextChunk[][] {
    const groups: NormalizedTextChunk[][] = []
    let currentGroup: NormalizedTextChunk[] | null = null

    for (const chunk of line.chunks) {
      const trimmed = chunk.text.trim()
      if (!trimmed) continue

      if (DATE_CHUNK_REGEX.test(trimmed)) {
        if (currentGroup && currentGroup.length > 0) {
          groups.push(currentGroup)
        }
        currentGroup = [{ ...chunk, text: trimmed }]
        continue
      }

      if (!currentGroup) {
        continue
      }

      currentGroup.push({ ...chunk, text: trimmed })

      if (AMOUNT_REGEX.test(trimmed)) {
        groups.push(currentGroup)
        currentGroup = null
      }
    }

    if (currentGroup && currentGroup.length > 0) {
      groups.push(currentGroup)
    }

    return groups
  }

  private buildDescription(chunks: NormalizedTextChunk[]): string {
    return chunks
      .map((chunk) => chunk.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private parseStatementDate(
    value: string,
    fallbackYear?: number,
    closingMonth?: number,
  ): string | null {
    const match = value.match(/^(\d{1,2})\s+([a-zç]{3,})$/i)
    if (!match) return null

    const day = match[1].padStart(2, '0')
    const monthName = this.normalizeMonth(match[2])
    const month = MONTH_MAP[monthName]
    if (!month) return null

    let year = fallbackYear ?? new Date().getFullYear()
    if (closingMonth && Number.parseInt(month, 10) > closingMonth) {
      year -= 1
    }

    return `${year}-${month}-${day}`
  }

  private normalizeAmountSign(description: string, amount: number): number {
    const creditIndicators = /(estorno|pagamento|cr[eé]dito|cashback|ajuste|antecip|inclus[aã]o)/i
    const isCredit = creditIndicators.test(description)
    const normalized = isCredit ? amount : amount * -1
    return Number(normalized.toFixed(2))
  }

  private parseCardHeader(line: NormalizedTextLine): {
    cardName: string
    cardholder?: string
    lastDigits?: string
    cardType?: string | null
  } {
    const amountChunkIndex = line.chunks.findIndex((chunk) => VALUE_WITH_CURRENCY_REGEX.test(chunk.text))
    const infoChunks =
      amountChunkIndex >= 0 ? line.chunks.slice(amountChunkIndex + 1) : line.chunks.slice(1)

    const cardName = infoChunks[0]?.text.trim() ?? line.text.replace(SUBTOTAL_REGEX, '').trim()
    const cardType = infoChunks.slice(1).map((chunk) => chunk.text.trim()).join(' ').trim() || null

    const lastDigitsMatch = cardName.match(/Final\s*(\d{4})/i)
    const holderMatch = cardName.match(/-\s*([A-ZÀ-Ú\s]+)/)

    return {
      cardName,
      cardholder: holderMatch ? holderMatch[1].trim() : undefined,
      lastDigits: lastDigitsMatch ? lastDigitsMatch[1] : undefined,
      cardType,
    }
  }

  private parseDateValue(value: string, fallbackYear?: number): string | null {
    if (!value) return null
    const trimmed = value.trim()

    const numericMatch = trimmed.match(/^(\d{2})[/-](\d{2})(?:[/-](\d{2,4}))?$/)
    if (numericMatch) {
      const [, dd, mm, yy] = numericMatch
      let year = yy
      if (!year) {
        year = fallbackYear ? String(fallbackYear) : String(new Date().getFullYear())
      } else if (year.length === 2) {
        year = `20${year}`
      }
      return `${year}-${mm}-${dd}`
    }

    const textMatch = trimmed.match(/^(\d{1,2})\s+de\s+([a-zç]+)(?:\s+de\s+(\d{4}))?$/i)
    if (textMatch) {
      const [, day, monthText, yearText] = textMatch
      const month = MONTH_MAP[this.normalizeMonth(monthText)]
      if (!month) return null
      const year = yearText ?? String(fallbackYear ?? new Date().getFullYear())
      return `${year}-${month}-${day.padStart(2, '0')}`
    }

    return null
  }

  private normalizeMonth(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
  }

  private extractYear(dateIso?: string | null): number | undefined {
    if (!dateIso) return undefined
    const match = dateIso.match(/^(\d{4})-/)
    return match ? Number.parseInt(match[1], 10) : undefined
  }

  private extractMonth(dateIso?: string | null): number | undefined {
    if (!dateIso) return undefined
    const match = dateIso.match(/^\d{4}-(\d{2})-/)
    return match ? Number.parseInt(match[1], 10) : undefined
  }

  private parseCurrency(value: string | null | undefined): number | null {
    if (!value) return null
    const sanitized = value
      .replace(/[\sR$]/gi, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '')

    const number = Number.parseFloat(sanitized)
    return Number.isFinite(number) ? Number(number.toFixed(2)) : null
  }

  private extractInvoiceTotal(lines: NormalizedTextLine[]): number | null {
    for (const line of lines) {
      const match = line.text.match(/VALOR\s+TOTAL\s*([\d.,]+)/i)
      if (match) {
        const amount = this.parseCurrency(match[1])
        if (amount !== null) {
          return amount
        }
      }
    }
    return null
  }

  private extractMinimumPayment(lines: NormalizedTextLine[]): number | null {
    for (const line of lines) {
      const match = line.text.match(/PAGAMENTO\s+M[IÍ]NIMO\s*([\d.,]+)/i)
      if (match) {
        const amount = this.parseCurrency(match[1])
        if (amount !== null) {
          return amount
        }
      }
    }
    return null
  }
}
