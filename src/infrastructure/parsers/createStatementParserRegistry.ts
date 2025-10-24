import { C6BankStatementParser, C6BankStatementParserConfig } from './pdf/C6BankStatementParser'
import { LocalStatementParser, LocalStatementParserConfig } from './pdf/LocalStatementParser'
import { StatementParser } from './StatementParser'
import { StatementParserRegistry } from './StatementParserRegistry'

export interface CreateStatementParserRegistryOptions {
  defaultBank?: string
  banks?: string[]
  localParserConfig?: LocalStatementParserConfig
  c6ParserConfig?: C6BankStatementParserConfig
}

export function createDefaultStatementParserRegistry(
  options?: CreateStatementParserRegistryOptions,
): StatementParserRegistry {
  const localConfig = options?.localParserConfig
  const c6Config = options?.c6ParserConfig

  const c6Factory = () => new C6BankStatementParser(c6Config)
  const genericFactory = () => new LocalStatementParser(localConfig)

  const baseFactories: Record<string, () => StatementParser> = {
    c6: c6Factory,
    'c6 bank': c6Factory,
    'c6-bank': c6Factory,
    c6bank: c6Factory,
    generic: genericFactory,
  }

  const banks = options?.banks ?? Object.keys(baseFactories)
  const defaultBank = options?.defaultBank ?? 'generic'

  const entries = banks.reduce<Record<string, () => StatementParser>>((acc, bank) => {
    const normalized = bank.trim().toLowerCase()
    const factory = baseFactories[normalized] ?? genericFactory
    acc[bank] = factory
    return acc
  }, {})

  for (const [alias, factory] of Object.entries(baseFactories)) {
    if (!Object.prototype.hasOwnProperty.call(entries, alias)) {
      entries[alias] = factory
    }
  }

  const hasGeneric = Object.keys(entries).some((key) => key.trim().toLowerCase() === 'generic')
  if (!hasGeneric) {
    entries.generic = genericFactory
  }

  return new StatementParserRegistry(entries, { defaultBank })
}
