import { CreditCardStatement } from '../../domain/entities/CreditCardStatement'
import {
  StatementExtractionParams,
  StatementExtractionService,
} from '../../domain/services/StatementExtractionService'

export class ExtractStatementUseCase {
  constructor(private readonly extractionService: StatementExtractionService) {}

  async execute(
    params: StatementExtractionParams,
  ): Promise<CreditCardStatement> {
    return this.extractionService.extractFromPdf(params)
  }
}
