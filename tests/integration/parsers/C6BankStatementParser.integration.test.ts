import { afterEach, describe, expect, it, vi } from 'vitest'

import { C6BankStatementParser } from '../../../src/infrastructure/parsers/pdf/C6BankStatementParser'
import { Pdf2JsonExtractor } from '../../../src/infrastructure/parsers/pdf/Pdf2JsonExtractor'
import { PdfTextNormalizer } from '../../../src/infrastructure/parsers/pdf/PdfTextNormalizer'
import {
  c6BankNormalizedLines,
  c6BankPdfDocument,
} from '../../fixtures/c6BankStatement'

describe('C6BankStatementParser integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('computes the correct subtotals for each card and the overall total', async () => {
    const parser = new C6BankStatementParser()
    const pdfSpy = vi
      .spyOn(Pdf2JsonExtractor.prototype, 'extract')
      .mockResolvedValue(c6BankPdfDocument)
    const normalizerSpy = vi
      .spyOn(PdfTextNormalizer.prototype, 'normalize')
      .mockReturnValue(c6BankNormalizedLines)

    const result = await parser.parse(Buffer.from('fake pdf data'))

    expect(pdfSpy).toHaveBeenCalled()
    expect(normalizerSpy).toHaveBeenCalled()
    expect(result.statement).not.toBeNull()
    const statement = result.statement
    if (!statement) {
      throw new Error('Expected statement to be defined')
    }

    expect(statement.cardholder_name).toBe('LEANDRO AZEVEDO MARTINS')
    expect(statement.total_amount_due).toBe(2000)
    expect(statement.cards.flatMap((card) => card.transactions)).toHaveLength(3)

    const metadata = (statement.metadata ?? {}) as {
      cardSummaries?: Array<{ section: string; expectedSubtotal: number; computedSubtotal: number; subtotalDifference: number; transactionCount: number }>
    }
    const summaries = Array.isArray(metadata.cardSummaries)
      ? metadata.cardSummaries
      : []
    expect(summaries).toHaveLength(2)

    const principalCard = summaries.find((summary) => summary.section === 'principal')
    expect(principalCard).toMatchObject({
      expectedSubtotal: 1500,
      computedSubtotal: 1500,
      subtotalDifference: 0,
      transactionCount: 2,
    })

    const additionalCard = summaries.find((summary) => summary.section === 'adicionais')
    expect(additionalCard).toMatchObject({
      expectedSubtotal: 500,
      computedSubtotal: 500,
      subtotalDifference: 0,
      transactionCount: 1,
    })

    const principalCardDetails = statement.cards.find((card) => card.is_additional === false)
    expect(principalCardDetails).toMatchObject({
      last4_digits: '1111',
      card_subtotal: 1500,
    })
    expect(principalCardDetails?.cardholder).toMatch(/LEANDRO AZEVEDO/i)
    expect(principalCardDetails?.transactions).toHaveLength(2)
    expect(principalCardDetails?.transactions?.every((tx) => (tx.amount ?? 0) > 0)).toBe(true)

    const additionalCardDetails = statement.cards.find((card) => card.is_additional === true)
    expect(additionalCardDetails).toMatchObject({
      last4_digits: '2222',
      card_subtotal: 500,
    })
    expect(additionalCardDetails?.cardholder).toMatch(/MARIA AZEVEDO/i)
    expect(additionalCardDetails?.transactions).toHaveLength(1)
  })
})
