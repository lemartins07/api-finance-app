import OpenAI, { toFile } from 'openai'
import type { ResponseFormatTextJSONSchemaConfig } from 'openai/resources/responses/responses'

import type {
  CreditCardStatement,
  StatementCard,
  StatementTransaction,
  TransactionType,
} from '../../domain/entities/CreditCardStatement'
import {
  StatementExtractionParams,
  StatementExtractionService,
} from '../../domain/services/StatementExtractionService'

export interface OpenAIStatementExtractionConfig {
  model: string
  systemPrompt?: string
}

const DEFAULT_SYSTEM_PROMPT = [
  'Você é um assistente financeiro especialista em analisar faturas de cartão de crédito brasileiras.',
  'Receberá um PDF com a fatura e deve extrair todas as informações relevantes.',
  'Retorne os dados seguindo estritamente o schema JSON fornecido, preenchendo com null quando a informação não estiver presente.',
].join(' ')

const STATEMENT_JSON_SCHEMA: ResponseFormatTextJSONSchemaConfig = {
  name: 'credit_card_statement',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'cardholder_name',
      'main_card_last4',
      'due_date',
      'closing_date',
      'total_amount_due',
      'minimum_payment',
      'best_purchase_day',
      'auto_debit',
      'annual_fee',
      'credit_limit',
      'available_limit',
      'cards',
    ],
    properties: {
      cardholder_name: { type: ['string', 'null'] },
      main_card_last4: { type: ['string', 'null'] },
      due_date: {
        type: ['string', 'null'],
        description: 'Formato ISO YYYY-MM-DD',
      },
      closing_date: {
        type: ['string', 'null'],
        description: 'Formato ISO YYYY-MM-DD',
      },
      total_amount_due: { type: ['number', 'null'] },
      minimum_payment: { type: ['number', 'null'] },
      best_purchase_day: { type: ['integer', 'null'] },
      auto_debit: {
        type: ['string', 'null'],
        enum: ['Enabled', 'Disabled', null],
      },
      annual_fee: { type: ['string', 'null'] },
      credit_limit: { type: ['number', 'null'] },
      available_limit: { type: ['number', 'null'] },
      cards: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'card_type',
            'last4_digits',
            'cardholder',
            'is_additional',
            'card_subtotal',
            'transactions',
          ],
          additionalProperties: false,
          properties: {
            card_type: { type: ['string', 'null'] },
            last4_digits: { type: ['string', 'null'] },
            cardholder: { type: ['string', 'null'] },
            is_additional: { type: ['boolean', 'null'] },
            card_subtotal: { type: ['number', 'null'] },
            transactions: {
              type: 'array',
              items: {
                type: 'object',
                required: [
                  'date',
                  'description',
                  'amount',
                  'currency',
                  'transaction_type',
                  'inferred_category',
                  'installment',
                ],
                additionalProperties: false,
                properties: {
                  date: {
                    type: ['string', 'null'],
                    description: 'Formato ISO YYYY-MM-DD',
                  },
                  description: { type: ['string', 'null'] },
                  amount: { type: ['number', 'null'] },
                  currency: { type: 'string', default: 'BRL' },
                  transaction_type: {
                    type: ['string', 'null'],
                    enum: [
                      'purchase',
                      'installment',
                      'payment',
                      'refund',
                      'fee',
                      'adjustment',
                      null,
                    ],
                  },
                  inferred_category: { type: ['string', 'null'] },
                  installment: {
                    type: 'object',
                    required: ['current', 'total'],
                    additionalProperties: false,
                    properties: {
                      current: { type: ['number', 'null'] },
                      total: { type: ['number', 'null'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
      metadata: {
        type: ['object', 'null'],
        additionalProperties: true,
      },
    },
  },
  type: 'json_schema',
}

const VALID_TRANSACTION_TYPES: TransactionType[] = [
  'purchase',
  'installment',
  'payment',
  'refund',
  'fee',
  'adjustment',
]

function normalizeTransactionType(value: unknown): TransactionType {
  return VALID_TRANSACTION_TYPES.includes(value as TransactionType)
    ? (value as TransactionType)
    : null
}

function normalizeInstallment(
  value: StatementTransaction['installment'] | undefined,
): StatementTransaction['installment'] {
  if (!value || typeof value !== 'object') {
    return { current: null, total: null }
  }

  const currentValue = (value as StatementTransaction['installment']).current
  const totalValue = (value as StatementTransaction['installment']).total

  const current =
    typeof currentValue === 'number' && Number.isFinite(currentValue)
      ? Number(currentValue)
      : null
  const total =
    typeof totalValue === 'number' && Number.isFinite(totalValue)
      ? Number(totalValue)
      : null

  return { current, total }
}

export class OpenAIStatementExtractionService
  implements StatementExtractionService
{
  private readonly client: OpenAI
  private readonly model: string
  private readonly systemPrompt: string

  constructor(
    apiKey: string,
    config?: Partial<OpenAIStatementExtractionConfig>,
  ) {
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY não configurada.')
    }

    this.client = new OpenAI({ apiKey })
    this.model = config?.model ?? 'gpt-4.1-mini'
    this.systemPrompt = config?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
  }

  async extractFromPdf(
    params: StatementExtractionParams,
  ): Promise<CreditCardStatement> {
    const { fileBuffer, fileName, mimeType } = params

    const uploadedFile = await this.client.files.create({
      file: await toFile(fileBuffer, fileName, { type: mimeType }),
      purpose: 'assistants',
    })

    try {
      const response = await this.client.responses.create({
        model: this.model,
        instructions: this.systemPrompt,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: [
                  'Analise a fatura e retorne todas as informações estruturadas.',
                  'Valores devem ser números com separador decimal em ponto.',
                  'Datas devem estar no formato ISO (YYYY-MM-DD).',
                ].join(' '),
              },
              {
                type: 'input_file',
                file_id: uploadedFile.id,
              },
            ],
          },
        ],
        text: {
          format: STATEMENT_JSON_SCHEMA,
        },
      })

      if (!response.output_text) {
        throw new Error('A resposta do modelo não contém texto para análise.')
      }

      const statement = JSON.parse(response.output_text) as CreditCardStatement

      statement.cardholder_name ??= null
      statement.main_card_last4 ??= null
      statement.due_date ??= null
      statement.closing_date ??= null
      statement.total_amount_due =
        typeof statement.total_amount_due === 'number' &&
        Number.isFinite(statement.total_amount_due)
          ? Number(statement.total_amount_due)
          : null
      statement.minimum_payment =
        typeof statement.minimum_payment === 'number' &&
        Number.isFinite(statement.minimum_payment)
          ? Number(statement.minimum_payment)
          : null
      statement.best_purchase_day =
        typeof statement.best_purchase_day === 'number' &&
        Number.isFinite(statement.best_purchase_day)
          ? Math.trunc(statement.best_purchase_day)
          : null
      statement.auto_debit =
        statement.auto_debit === 'Enabled' || statement.auto_debit === 'Disabled'
          ? statement.auto_debit
          : null
      statement.annual_fee = statement.annual_fee ?? null
      statement.credit_limit =
        typeof statement.credit_limit === 'number' && Number.isFinite(statement.credit_limit)
          ? Number(statement.credit_limit)
          : null
      statement.available_limit =
        typeof statement.available_limit === 'number' &&
        Number.isFinite(statement.available_limit)
          ? Number(statement.available_limit)
          : null

      statement.cards = (statement.cards ?? []).map((card: StatementCard) => {
        const transactions = (card.transactions ?? []).map((transaction: StatementTransaction) => {
          const amount =
            typeof transaction.amount === 'number' && Number.isFinite(transaction.amount)
              ? Number(transaction.amount)
              : null

          return {
            date: transaction.date ?? null,
            description: transaction.description ?? null,
            amount,
            currency: transaction.currency ?? 'BRL',
            transaction_type: normalizeTransactionType(transaction.transaction_type),
            inferred_category: transaction.inferred_category ?? null,
            installment: normalizeInstallment(transaction.installment),
          }
        })

        return {
          card_type: card.card_type ?? null,
          last4_digits: card.last4_digits ?? null,
          cardholder: card.cardholder ?? null,
          is_additional:
            typeof card.is_additional === 'boolean' ? card.is_additional : null,
          card_subtotal:
            typeof card.card_subtotal === 'number' && Number.isFinite(card.card_subtotal)
              ? Number(card.card_subtotal)
              : null,
          transactions,
        }
      })

      if (statement.metadata == null) {
        statement.metadata = {}
      }

      return statement
    } finally {
      await this.client.files.delete(uploadedFile.id)
    }
  }
}
