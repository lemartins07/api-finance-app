import { StatementParser } from './StatementParser'

export interface StatementParserRegistryOptions {
  defaultBank?: string
}

export interface StatementParserRegistryEntries {
  [bank: string]: StatementParser | (() => StatementParser)
}

export interface ResolvedStatementParser {
  parser: StatementParser
  bankKey: string
  isFallback: boolean
}

export class StatementParserRegistry {
  private readonly factories = new Map<string, () => StatementParser>()
  private readonly instances = new Map<string, StatementParser>()
  private readonly defaultBankKey?: string

  constructor(
    entries: StatementParserRegistryEntries,
    options?: StatementParserRegistryOptions,
  ) {
    for (const [bank, parserOrFactory] of Object.entries(entries)) {
      const normalizedBank = this.normalize(bank)

      if (typeof parserOrFactory === 'function') {
        this.factories.set(normalizedBank, parserOrFactory as () => StatementParser)
      } else {
        const instance = parserOrFactory
        this.factories.set(normalizedBank, () => instance)
        this.instances.set(normalizedBank, instance)
      }
    }

    this.defaultBankKey = options?.defaultBank
      ? this.normalize(options.defaultBank)
      : undefined
  }

  resolve(bank: string): ResolvedStatementParser | null {
    const normalizedBank = this.normalize(bank)

    if (this.factories.has(normalizedBank)) {
      return {
        parser: this.getOrCreateInstance(normalizedBank),
        bankKey: normalizedBank,
        isFallback: false,
      }
    }

    if (this.defaultBankKey && this.factories.has(this.defaultBankKey)) {
      return {
        parser: this.getOrCreateInstance(this.defaultBankKey),
        bankKey: this.defaultBankKey,
        isFallback: true,
      }
    }

    return null
  }

  private getOrCreateInstance(bankKey: string): StatementParser {
    const cached = this.instances.get(bankKey)
    if (cached) {
      return cached
    }

    const factory = this.factories.get(bankKey)
    if (!factory) {
      throw new Error(`Parser não registrado para o banco '${bankKey}'.`)
    }

    const instance = factory()
    this.instances.set(bankKey, instance)
    return instance
  }

  private normalize(bank: string): string {
    return bank.trim().toLowerCase()
  }
}
