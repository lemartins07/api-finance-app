import { describe, expect, it } from 'vitest'

import { createDefaultStatementParserRegistry } from '../../../src/infrastructure/parsers/createStatementParserRegistry'
import { C6BankStatementParser } from '../../../src/infrastructure/parsers/pdf/C6BankStatementParser'
import { LocalStatementParser } from '../../../src/infrastructure/parsers/pdf/LocalStatementParser'

describe('createDefaultStatementParserRegistry', () => {
  it('returns a C6 parser instance for the canonical C6 bank key', () => {
    const registry = createDefaultStatementParserRegistry()

    const result = registry.resolve('c6')

    expect(result).not.toBeNull()
    expect(result?.isFallback).toBe(false)
    expect(result?.parser).toBeInstanceOf(C6BankStatementParser)
  })

  it('supports resolving documented aliases for the C6 bank', () => {
    const registry = createDefaultStatementParserRegistry({ banks: ['C6 Bank', 'generic'] })

    const result = registry.resolve('C6 Bank')

    expect(result).not.toBeNull()
    expect(result?.isFallback).toBe(false)
    expect(result?.parser).toBeInstanceOf(C6BankStatementParser)
  })

  it('returns the generic parser for unknown banks using the fallback', () => {
    const registry = createDefaultStatementParserRegistry()

    const result = registry.resolve('nubank')

    expect(result).not.toBeNull()
    expect(result?.isFallback).toBe(true)
    expect(result?.parser).toBeInstanceOf(LocalStatementParser)
  })

  it('ensures a generic parser is always registered even when not provided explicitly', () => {
    const registry = createDefaultStatementParserRegistry({ banks: ['c6'] })

    const result = registry.resolve('generic')

    expect(result).not.toBeNull()
    expect(result?.parser).toBeInstanceOf(LocalStatementParser)
  })
})
