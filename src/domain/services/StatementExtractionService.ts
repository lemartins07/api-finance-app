import { CreditCardStatement } from '../entities/CreditCardStatement'

export interface StatementExtractionParams {
  fileBuffer: Buffer
  fileName: string
  mimeType: string
}

export interface StatementExtractionService {
  extractFromPdf(
    params: StatementExtractionParams,
  ): Promise<CreditCardStatement>
}
