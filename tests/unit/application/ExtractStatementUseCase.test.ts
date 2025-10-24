import { describe, expect, it, vi } from 'vitest'

import { ExtractStatementUseCase } from '../../../src/application/useCases/ExtractStatementUseCase'
import { CreditCardStatement } from '../../../src/domain/entities/CreditCardStatement'
import { StatementExtractionService } from '../../../src/domain/services/StatementExtractionService'

describe('ExtractStatementUseCase', () => {
  it('delegates the extraction to the service including the bank parameter', async () => {
    const mockStatement = {
      cardholder_name: 'Tester',
      main_card_last4: '1234',
      due_date: null,
      closing_date: null,
      total_amount_due: 100,
      minimum_payment: null,
      best_purchase_day: null,
      auto_debit: null,
      annual_fee: null,
      credit_limit: null,
      available_limit: null,
      cards: [],
      metadata: {},
    } satisfies CreditCardStatement

    const service: StatementExtractionService = {
      extractFromPdf: vi.fn().mockResolvedValue(mockStatement),
    }

    const useCase = new ExtractStatementUseCase(service)

    const params = {
      bank: 'c6',
      fileBuffer: Buffer.from('pdf'),
      fileName: 'statement.pdf',
      mimeType: 'application/pdf',
    }

    const result = await useCase.execute(params)

    expect(service.extractFromPdf).toHaveBeenCalledWith(params)
    expect(result).toBe(mockStatement)
  })
})
