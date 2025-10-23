import { StatementParserRegistry } from './StatementParserRegistry'
import { LocalStatementParser, LocalStatementParserConfig } from './pdf/LocalStatementParser'

export interface CreateStatementParserRegistryOptions {
  defaultBank?: string
  banks?: string[]
  localParserConfig?: LocalStatementParserConfig
}

export function createDefaultStatementParserRegistry(
  options?: CreateStatementParserRegistryOptions,
): StatementParserRegistry {
  const banks = options?.banks ?? ['generic']
  const defaultBank = options?.defaultBank ?? banks[0]
  const parserConfig = options?.localParserConfig

  const entries = banks.reduce<Record<string, () => LocalStatementParser>>(
    (acc, bank) => {
      acc[bank] = () => new LocalStatementParser(parserConfig)
      return acc
    },
    {},
  )

  return new StatementParserRegistry(entries, { defaultBank })
}
