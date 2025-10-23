import { CreditCardStatement } from '../../domain/entities/CreditCardStatement'
import {
  StatementExtractionParams,
  StatementExtractionService,
} from '../../domain/services/StatementExtractionService'
import { LocalStatementParserConfig, NormalizedTextLine } from '../parsers'
import { createDefaultStatementParserRegistry } from '../parsers/createStatementParserRegistry'
import {
  ResolvedStatementParser,
  StatementParserRegistry,
} from '../parsers/StatementParserRegistry'

export class LocalParserInsufficientDataError extends Error {
  constructor(message = 'Parser local não encontrou dados suficientes.') {
    super(message)
    this.name = 'LocalParserInsufficientDataError'
  }
}

export class UnsupportedBankError extends Error {
  constructor(bank: string) {
    super(`Banco '${bank}' não é suportado pelo parser local.`)
    this.name = 'UnsupportedBankError'
  }
}

export class LocalStatementExtractionService implements StatementExtractionService {
  private readonly parserRegistry: StatementParserRegistry

  constructor(
    parserRegistry?: StatementParserRegistry,
    config?: LocalStatementParserConfig,
  ) {
    this.parserRegistry =
      parserRegistry ?? createDefaultStatementParserRegistry({ localParserConfig: config })
  }

  async extractFromPdf(
    params: StatementExtractionParams,
  ): Promise<CreditCardStatement> {
    const resolvedParser = this.resolveParser(params.bank)
    const result = await resolvedParser.parser.parse(params.fileBuffer)

    if (resolvedParser.isFallback) {
      console.warn(
        `[local-parser] banco '${params.bank}' não suportado explicitamente, utilizando parser '${resolvedParser.bankKey}' como fallback`,
      )
    }

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

    console.info(
      `[local-parser] sucesso: statement montado localmente para banco '${params.bank}' (parser='${resolvedParser.bankKey}')`,
    )

    const metadata = {
      ...(result.statement.metadata ?? {}),
      parser: 'local',
      bank: params.bank,
      resolvedBank: resolvedParser.bankKey,
      usedFallbackParser: resolvedParser.isFallback,
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

  private resolveParser(bank: string): ResolvedStatementParser {
    const resolved = this.parserRegistry.resolve(bank)

    if (!resolved) {
      throw new UnsupportedBankError(bank)
    }

    return resolved
  }
}
