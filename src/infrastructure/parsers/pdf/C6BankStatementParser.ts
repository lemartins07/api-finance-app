import { performance } from 'node:perf_hooks'

import {
  CreditCardStatement,
  StatementCard,
  StatementTransaction,
  TransactionType,
} from '../../../domain/entities/CreditCardStatement'
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
  cardholderName?: string
  closingDate?: string | null
  dueDate?: string | null
  invoiceNumber?: string | null
  totalAmount?: number | null
  minimumPayment?: number | null
  bestPurchaseDay?: number | null
  autoDebit?: 'Enabled' | 'Disabled' | null
  annualFee?: string | null
  creditLimit?: number | null
  availableLimit?: number | null
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
  transactions: StatementTransaction[]
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

    const cards: StatementCard[] = cardBlocks.map((block) => ({
      card_type: block.cardType ?? null,
      last4_digits: block.lastDigits ?? null,
      cardholder: block.cardholder ?? null,
      is_additional: block.section === 'adicionais',
      card_subtotal: block.expectedSubtotal,
      transactions: block.transactions,
    }))

    const mainCardLast4 =
      cardBlocks.find((block) => block.section === 'principal' && block.lastDigits)?.lastDigits ??
      null

    const statement: CreditCardStatement = {
      cardholder_name: header.cardholderName ?? null,
      main_card_last4: mainCardLast4,
      due_date: header.dueDate ?? null,
      closing_date: header.closingDate ?? null,
      total_amount_due: totalAmount,
      minimum_payment: minimumPayment,
      best_purchase_day: header.bestPurchaseDay ?? null,
      auto_debit: header.autoDebit ?? null,
      annual_fee: header.annualFee ?? null,
      credit_limit: header.creditLimit ?? null,
      available_limit: header.availableLimit ?? null,
      cards,
      metadata: {
        parser: 'local:c6-bank',
        source: 'pdf2json',
        lineCount: lines.length,
        invoiceNumber: header.invoiceNumber ?? null,
        cardSummaries: cardBlocks.map((block) => {
          const signedTotal = Number(
            block.transactions
              .reduce((acc, tx) => acc + this.getSignedAmount(tx), 0)
              .toFixed(2),
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
    const result: ParsedHeaderResult = {}

    for (const line of lines) {
      const text = line.text
      if (!text) continue

      if (!result.cardholderName) {
        const candidate = text.trim()
        if (
          candidate.length >= 5 &&
          /^(?:[A-ZÀ-Ü][A-ZÀ-Ü\s\-']+)$/.test(candidate) &&
          candidate.split(/\s+/).length >= 2
        ) {
          result.cardholderName = candidate
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

      if (result.bestPurchaseDay == null) {
        const bestDayMatch = text.match(/Melhor dia de compra:\s*(\d{1,2})/i)
        if (bestDayMatch) {
          result.bestPurchaseDay = Number.parseInt(bestDayMatch[1], 10)
        }
      }

      if (result.autoDebit === undefined) {
        const autoDebitMatch = text.match(/Débito automático:\s*(Ativado|Desativado)/i)
        if (autoDebitMatch) {
          const value = autoDebitMatch[1].toLowerCase()
          result.autoDebit = value.startsWith('ativ') ? 'Enabled' : 'Disabled'
        }
      }

      if (!result.annualFee) {
        const annualFeeMatch = text.match(/Anuidade:\s*([^|]+)/i)
        if (annualFeeMatch) {
          result.annualFee = this.normalizeAnnualFee(annualFeeMatch[1])
        }
      }

      if (!result.creditLimit) {
        const creditLimitMatch = text.match(/Limite\s+(?:total|crédito).*R\$\s*([\d.,]+)/i)
        if (creditLimitMatch) {
          result.creditLimit = this.parseCurrency(creditLimitMatch[1])
        }
      }

      if (!result.availableLimit) {
        const availableLimitMatch = text.match(/Limite\s+disponível.*R\$\s*([\d.,]+)/i)
        if (availableLimitMatch) {
          result.availableLimit = this.parseCurrency(availableLimitMatch[1])
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
  ): StatementTransaction[] {
    const transactions: StatementTransaction[] = []

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

        const transactionType = this.determineTransactionType(description)
        const installment = this.extractInstallmentInfo(description)

        transactions.push({
          date,
          description,
          amount,
          currency: this.fallbackCurrency,
          transaction_type: transactionType,
          inferred_category: null,
          installment,
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

  private determineTransactionType(description: string): TransactionType {
    const normalized = description.toLowerCase()

    if (/(estorno|reembolso|cashback|cr[eé]dito)/i.test(normalized)) {
      return 'refund'
    }

    if (/(pagamento|pagto|boleto|pix)/i.test(normalized)) {
      return 'payment'
    }

    if (/(ajuste|ajust|antecip|inclus[aã]o|compensa[cç][aã]o)/i.test(normalized)) {
      return 'adjustment'
    }

    if (/(tarifa|juros|encargo|anuidade|multa)/i.test(normalized)) {
      return 'fee'
    }

    if (/(parcela|parcelamento|parcelado|\d+\/\d+)/i.test(normalized)) {
      return 'installment'
    }

    return 'purchase'
  }

  private extractInstallmentInfo(description: string): StatementTransaction['installment'] {
    const match = description.match(/(\d{1,2})\/(\d{1,2})/)
    if (!match) {
      return { current: null, total: null }
    }

    const current = Number.parseInt(match[1], 10)
    const total = Number.parseInt(match[2], 10)

    if (Number.isNaN(current) || Number.isNaN(total)) {
      return { current: null, total: null }
    }

    return { current, total }
  }

  private getSignedAmount(transaction: StatementTransaction): number {
    const amount = transaction.amount ?? 0
    const type = transaction.transaction_type

    if (type === 'payment' || type === 'refund' || type === 'adjustment') {
      return amount
    }

    return amount * -1
  }

  private normalizeAnnualFee(value: string | null | undefined): string | null {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/isento/i.test(trimmed)) {
      return 'Exempt'
    }
    return trimmed
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
