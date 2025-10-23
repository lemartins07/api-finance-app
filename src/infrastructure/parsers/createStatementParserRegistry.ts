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
  const banks = options?.banks ?? ['c6', 'generic']
  const defaultBank = options?.defaultBank ?? 'generic'
  const localConfig = options?.localParserConfig
  const c6Config = options?.c6ParserConfig

  const c6Factory = () => new C6BankStatementParser(c6Config)
  const genericFactory = () => new LocalStatementParser(localConfig)

  const factories: Record<string, () => StatementParser> = {
    c6: c6Factory,
    'c6 bank': c6Factory,
    'c6-bank': c6Factory,
    c6bank: c6Factory,
    generic: genericFactory,
  }

  const entries = banks.reduce<Record<string, () => StatementParser>>((acc, bank) => {
    const normalized = bank.trim().toLowerCase()
    const factory = factories[normalized] ?? genericFactory
    acc[bank] = factory
    return acc
  }, {})

  const hasGeneric = Object.keys(entries).some((key) => key.trim().toLowerCase() === 'generic')
  if (!hasGeneric) {
    entries.generic = genericFactory
  }

  return new StatementParserRegistry(entries, { defaultBank })
}
