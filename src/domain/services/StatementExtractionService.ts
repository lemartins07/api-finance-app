import { CreditCardStatement } from '../entities/CreditCardStatement'

export interface StatementExtractionParams {
  bank: string
  fileBuffer: Buffer
  fileName: string
  mimeType: string
}

export interface StatementExtractionService {
  extractFromPdf(
    params: StatementExtractionParams,
  ): Promise<CreditCardStatement>
}
