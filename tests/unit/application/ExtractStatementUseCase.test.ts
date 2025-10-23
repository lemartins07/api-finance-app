import { describe, expect, it, vi } from 'vitest'

import { ExtractStatementUseCase } from '../../../src/application/useCases/ExtractStatementUseCase'
import { CreditCardStatement } from '../../../src/domain/entities/CreditCardStatement'
import { StatementExtractionService } from '../../../src/domain/services/StatementExtractionService'

describe('ExtractStatementUseCase', () => {
  it('delegates the extraction to the service including the bank parameter', async () => {
    const mockStatement = {
      cardholder: 'Tester',
      closingDate: null,
      dueDate: null,
      invoiceNumber: null,
      currency: 'BRL',
      totalAmount: 100,
      minimumPayment: null,
      transactions: [],
      rawTextPath: null,
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
