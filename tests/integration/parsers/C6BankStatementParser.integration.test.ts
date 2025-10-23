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
    expect(result.statement?.totalAmount).toBe(2000)
    expect(result.statement?.transactions).toHaveLength(3)

    const summaries = result.statement?.metadata.cardSummaries ?? []
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
  })
})
