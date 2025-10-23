import { CreditCardStatement } from '../../domain/entities/CreditCardStatement'
import {
  StatementExtractionParams,
  StatementExtractionService,
} from '../../domain/services/StatementExtractionService'
import { NormalizedTextLine } from '../parsers/pdf'
import {
  LocalStatementParser,
  LocalStatementParserConfig,
} from '../parsers/pdf/LocalStatementParser'

export class LocalParserInsufficientDataError extends Error {
  constructor(message = 'Parser local não encontrou dados suficientes.') {
    super(message)
    this.name = 'LocalParserInsufficientDataError'
  }
}

export class LocalStatementExtractionService implements StatementExtractionService {
  private readonly parser: LocalStatementParser

  constructor(config?: LocalStatementParserConfig) {
    this.parser = new LocalStatementParser(config)
  }

  async extractFromPdf(
    params: StatementExtractionParams,
  ): Promise<CreditCardStatement> {
    const result = await this.parser.parse(params.fileBuffer)

    if (result.metrics) {
      const { pdfExtractionMs, normalizationMs, headerDetectionMs, transactionDetectionMs, totalMs } =
        result.metrics

      console.info(
        `[local-parser] total=${totalMs}ms pdf=${pdfExtractionMs}ms normalize=${normalizationMs}ms header=${headerDetectionMs}ms transactions=${transactionDetectionMs}ms`,
      )
    }

    if (!result.statement) {
      console.warn(
        '[local-parser] falha: dados insuficientes para montar statement, enviando para fallback',
      )
      throw new LocalParserInsufficientDataError()
    }

    console.info('[local-parser] sucesso: statement montado localmente')

    const metadata = {
      ...(result.statement.metadata ?? {}),
      parser: 'local',
      rawLinesSample: result.lines
        .slice(0, 5)
        .map((line: NormalizedTextLine) => line.text),
      timingsMs: result.metrics,
    }

    return {
      ...result.statement,
      metadata,
    }
  }
}
