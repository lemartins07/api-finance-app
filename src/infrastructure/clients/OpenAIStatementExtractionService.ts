import OpenAI, { toFile } from 'openai'
import type { ResponseFormatTextJSONSchemaConfig } from 'openai/resources/responses/responses'

import { CreditCardStatement } from '../../domain/entities/CreditCardStatement'
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
      'cardholder',
      'closingDate',
      'dueDate',
      'invoiceNumber',
      'currency',
      'totalAmount',
      'minimumPayment',
      'rawTextPath',
      'transactions',
      'metadata',
    ],
    properties: {
      cardholder: { type: ['string', 'null'] },
      closingDate: {
        type: ['string', 'null'],
        description: 'Formato ISO YYYY-MM-DD',
      },
      dueDate: {
        type: ['string', 'null'],
        description: 'Formato ISO YYYY-MM-DD',
      },
      invoiceNumber: { type: ['string', 'null'] },
      currency: { type: 'string', default: 'BRL' },
      totalAmount: { type: ['number', 'null'] },
      minimumPayment: { type: ['number', 'null'] },
      rawTextPath: { type: ['string', 'null'] },
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'date',
            'description',
            'amount',
            'currency',
            'category',
            'metadata',
          ],
          additionalProperties: false,
          properties: {
            date: {
              type: ['string', 'null'],
              description: 'Formato ISO YYYY-MM-DD',
            },
            description: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string', default: 'BRL' },
            category: { type: ['string', 'null'] },
            metadata: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
        },
      },
      metadata: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  type: 'json_schema',
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

      statement.currency ??= 'BRL'
      statement.transactions = statement.transactions.map((transaction) => {
        const currency = transaction.currency ?? statement.currency ?? 'BRL'
        const metadata = transaction.metadata ?? {}
        return {
          ...transaction,
          currency,
          metadata,
        }
      })

      return statement
    } finally {
      await this.client.files.delete(uploadedFile.id)
    }
  }
}
