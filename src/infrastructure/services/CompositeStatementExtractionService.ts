import { CreditCardStatement } from '../../domain/entities/CreditCardStatement'
import {
  StatementExtractionParams,
  StatementExtractionService,
} from '../../domain/services/StatementExtractionService'

export class CompositeStatementExtractionService
  implements StatementExtractionService
{
  constructor(
    private readonly services: StatementExtractionService[],
  ) {}

  async extractFromPdf(
    params: StatementExtractionParams,
  ): Promise<CreditCardStatement> {
    const errors: unknown[] = []

    for (const service of this.services) {
      try {
        return await service.extractFromPdf(params)
      } catch (error) {
        errors.push(error)
      }
    }

    const summary = errors
      .map((error, index) => `#${index + 1}: ${this.formatError(error)}`)
      .join(' | ')

    throw new Error(`Nenhuma estratégia de extração obteve sucesso. ${summary}`)
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message
    }
    return String(error)
  }
}
