import { performance } from 'node:perf_hooks'

import {
  CreditCardStatement,
  StatementCard,
  StatementTransaction,
  TransactionType,
} from '../../../domain/entities/CreditCardStatement'
import { Pdf2JsonDocument, Pdf2JsonExtractor } from './Pdf2JsonExtractor'
import {
  NormalizedTextChunk,
  NormalizedTextLine,
  PdfTextNormalizer,
} from './PdfTextNormalizer'

const DATE_REGEX = /^(\d{2})[/-](\d{2})(?:[/-](\d{2,4}))?$/
const AMOUNT_REGEX = /-?\d{1,3}(?:\.\d{3})*,\d{2}$/

export interface LocalStatementParserConfig {
  fallbackCurrency?: string
  minimumTransactions?: number
}

export interface LocalStatementParserResult {
  statement: CreditCardStatement | null
  lines: NormalizedTextLine[]
  pdf: Pdf2JsonDocument
  metrics: LocalStatementParserMetrics
}

export interface LocalStatementParserMetrics {
  pdfExtractionMs: number
  normalizationMs: number
  headerDetectionMs: number
  transactionDetectionMs: number
  totalMs: number
}

export class LocalStatementParser {
  private readonly extractor: Pdf2JsonExtractor
  private readonly normalizer: PdfTextNormalizer
  private readonly fallbackCurrency: string
  private readonly minimumTransactions: number

  constructor(config?: LocalStatementParserConfig) {
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
    const transactions = this.extractTransactions(lines, header.year)
    const transactionsEnd = performance.now()

    if (transactions.length < this.minimumTransactions) {
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

    const cards: StatementCard[] =
      transactions.length > 0
        ? [
            {
              card_type: null,
              last4_digits: null,
              cardholder: header.cardholder ?? null,
              is_additional: null,
              card_subtotal: null,
              transactions,
            },
          ]
        : []

    const statement: CreditCardStatement = {
      cardholder_name: header.cardholder ?? null,
      main_card_last4: null,
      due_date: header.dueDate ?? null,
      closing_date: header.closingDate ?? null,
      total_amount_due: header.totalAmount ?? null,
      minimum_payment: header.minimumPayment ?? null,
      best_purchase_day: null,
      auto_debit: null,
      annual_fee: null,
      credit_limit: null,
      available_limit: null,
      cards,
      metadata: {
        parser: 'local',
        source: 'pdf2json',
        lineCount: lines.length,
        invoiceNumber: header.invoiceNumber ?? null,
        currency: header.currency ?? this.fallbackCurrency,
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

  private extractHeader(lines: NormalizedTextLine[]) {
    const result: {
      cardholder?: string
      closingDate?: string | null
      dueDate?: string | null
      invoiceNumber?: string | null
      currency?: string
      totalAmount?: number | null
      minimumPayment?: number | null
      year?: number
    } = {}

    for (const line of lines.slice(0, 80)) {
      const text = line.text

      const cardholderMatch = text.match(
        /(titular|nome do titular|cliente)\s*[-:]\s*(.+)/i,
      )
      if (cardholderMatch && !result.cardholder) {
        result.cardholder = cardholderMatch[2].trim()
      }

      const closingMatch = text.match(
        /(data\s+de\s+fechamento|fechamento)\s*[-:]\s*(\d{2}[-/]\d{2}(?:[-/]\d{2,4})?)/i,
      )
      if (closingMatch && !result.closingDate) {
        result.closingDate = this.parseDate(closingMatch[2])
        result.year = this.extractYear(result.closingDate)
      }

      const dueMatch = text.match(
        /(vencimento|pagamento\s+até)\s*[-:]\s*(\d{2}[-/]\d{2}(?:[-/]\d{2,4})?)/i,
      )
      if (dueMatch && !result.dueDate) {
        result.dueDate = this.parseDate(dueMatch[2])
        result.year = result.year ?? this.extractYear(result.dueDate)
      }

      const invoiceMatch = text.match(
        /(fatura\s*n[ºo.]|n[ºo.]\s+da\s+fatura|número\s+da\s+fatura)\s*[-:]\s*([0-9a-z-]+)/i,
      )
      if (invoiceMatch && !result.invoiceNumber) {
        result.invoiceNumber = invoiceMatch[2].trim()
      }

      const currencyMatch = text.match(/(BRL|USD|EUR|R\$)/i)
      if (currencyMatch && !result.currency) {
        const value = currencyMatch[1].toUpperCase()
        result.currency = value === 'R$' ? 'BRL' : value
      }

      const totalMatch = text.match(
        /(total\s+(da\s+fatura|a\s+pagar|geral)|valor\s+total)\s*[-:]?\s*([^\s].*)/i,
      )
      if (totalMatch && !result.totalAmount) {
        const amount = this.parseCurrency(totalMatch[3])
        if (amount !== null) {
          result.totalAmount = amount
        }
      }

      const minimumMatch = text.match(
        /(pagamento\s+mínimo|valor\s+mínimo)\s*[-:]?\s*([^\s].*)/i,
      )
      if (minimumMatch && !result.minimumPayment) {
        const amount = this.parseCurrency(minimumMatch[2])
        if (amount !== null) {
          result.minimumPayment = amount
        }
      }
    }

    return result
  }

  private extractTransactions(
    lines: NormalizedTextLine[],
    fallbackYear?: number,
  ): StatementTransaction[] {
    const transactions: StatementTransaction[] = []

    for (const line of lines) {
      if (line.chunks.length < 3) continue

      const sortedChunks = [...line.chunks].sort((a, b) => a.x - b.x)
      const dateCandidate = sortedChunks[0].text
      if (!DATE_REGEX.test(dateCandidate)) continue

      const amountText = this.combineAmountChunks(sortedChunks)
      if (!AMOUNT_REGEX.test(amountText)) continue

      const description = this.buildDescription(sortedChunks)
      if (!description) continue

      const date = this.parseDate(dateCandidate, fallbackYear)
      const amount = this.parseCurrency(amountText)

      if (amount === null) continue

      const transactionType = this.determineTransactionType(description)

      transactions.push({
        date,
        description,
        amount,
        currency: this.fallbackCurrency,
        transaction_type: transactionType,
        inferred_category: null,
        installment: { current: null, total: null },
      })
    }

    return transactions
  }

  private combineAmountChunks(chunks: NormalizedTextChunk[]): string {
    const lastChunk = chunks[chunks.length - 1]
    const secondLast = chunks.length > 1 ? chunks[chunks.length - 2] : undefined

    const raw = [secondLast, lastChunk]
      .filter(Boolean)
      .map((chunk) => chunk!.text)
      .join('')

    return raw.replace(/\s+/g, '')
  }

  private buildDescription(chunks: NormalizedTextChunk[]): string {
    if (chunks.length <= 2) return ''
    const middle = chunks.slice(1, -1)
    return middle
      .map((chunk) => chunk.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private parseDate(value: string | null | undefined, fallbackYear?: number): string | null {
    if (!value) return null
    const match = value.trim().match(DATE_REGEX)
    if (!match) return null
    const [, dd, mm, yy] = match

    let year = yy
    if (!year) {
      year = fallbackYear ? String(fallbackYear) : String(new Date().getFullYear())
    } else if (year.length === 2) {
      year = `20${year}`
    }

    return `${year}-${mm}-${dd}`
  }

  private extractYear(dateIso?: string | null): number | undefined {
    if (!dateIso) return undefined
    const match = dateIso.match(/^(\d{4})-/)
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

  private determineTransactionType(description: string): TransactionType {
    const normalized = description.toLowerCase()

    if (/(estorno|reembolso|cashback|cr[eé]dito)/i.test(normalized)) {
      return 'refund'
    }

    if (/(pagamento|pagto|boleto)/i.test(normalized)) {
      return 'payment'
    }

    if (/(parcela|parcelamento|parcelado)/i.test(normalized)) {
      return 'installment'
    }

    if (/(tarifa|juros|anuidade|multa|encargo)/i.test(normalized)) {
      return 'fee'
    }

    if (/(ajuste|ajustado|compensa[cç][aã]o)/i.test(normalized)) {
      return 'adjustment'
    }

    return 'purchase'
  }
}
