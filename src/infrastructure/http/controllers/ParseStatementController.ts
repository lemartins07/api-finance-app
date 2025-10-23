import { Multipart, MultipartFile } from '@fastify/multipart'
import { FastifyReply, FastifyRequest } from 'fastify'

import { ExtractStatementUseCase } from '../../../application/useCases/ExtractStatementUseCase'

interface StatementResponsePayload {
  statement: unknown
}

export class ParseStatementController {
  constructor(private readonly useCase: ExtractStatementUseCase) {}

  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { file, bank: bankFromForm } = await this.consumeMultipartPayload(request)
    const bank =
      bankFromForm ??
      this.extractBankFromQuery(request) ??
      this.extractBankFromHeaders(request)

    if (!file) {
      reply.status(400).send({
        message: "Arquivo PDF não enviado. Utilize o campo 'file'.",
      })
      return
    }

    if (!file.mimetype?.includes('pdf')) {
      reply.status(400).send({
        message: 'Arquivo inválido. Envie uma fatura em formato PDF.',
      })
      return
    }

    if (!bank) {
      reply.status(400).send({
        message: "Campo 'bank' é obrigatório.",
      })
      return
    }

    try {
      const statement = await this.useCase.execute({
        bank,
        fileBuffer: file.buffer,
        fileName: file.filename ?? 'statement.pdf',
        mimeType: file.mimetype,
      })

      const payload: StatementResponsePayload = { statement }
      reply.status(200).send(payload)
    } catch (error) {
      request.log.error(error)
      reply.status(500).send({
        message: 'Não foi possível processar a fatura no momento.',
      })
    }
  }

  private async consumeMultipartPayload(
    request: FastifyRequest,
  ): Promise<{
    file: (MultipartFile & { buffer: Buffer }) | null
    bank: string | null
  }> {
    const multipartRequest = request as FastifyRequest & {
      file: () => Promise<MultipartFile | undefined>
      parts: () => AsyncIterableIterator<Multipart | MultipartFile>
    }

    if (typeof multipartRequest.file !== 'function') {
      return { file: null, bank: null }
    }

    if (typeof multipartRequest.parts !== 'function') {
      const file = await multipartRequest.file()

      if (!file) return { file: null, bank: null }

      return {
        file: {
          ...file,
          buffer: await file.toBuffer(),
        },
        bank: null,
      }
    }

    let file: (MultipartFile & { buffer: Buffer }) | null = null
    let bank: string | null = null

    for await (const part of multipartRequest.parts()) {
      if (part.type === 'file') {
        if (!file && part.fieldname === 'file') {
          file = {
            ...(part as MultipartFile),
            buffer: await (part as MultipartFile).toBuffer(),
          }
        }
        continue
      }

      if (part.type === 'field' && part.fieldname === 'bank') {
        const value = Array.isArray(part.value)
          ? part.value[0]
          : part.value
        if (typeof value === 'string' && value.trim().length > 0) {
          bank = value.trim()
        }
      }
    }

    return { file, bank }
  }

  private extractBankFromQuery(request: FastifyRequest): string | null {
    const query = request.query as { bank?: unknown } | undefined
    const bank = query?.bank

    if (typeof bank === 'string' && bank.trim().length > 0) {
      return bank.trim()
    }

    return null
  }

  private extractBankFromHeaders(request: FastifyRequest): string | null {
    const header = request.headers['x-bank']

    if (typeof header === 'string' && header.trim().length > 0) {
      return header.trim()
    }

    if (Array.isArray(header)) {
      const value = header.find((item) => typeof item === 'string' && item.trim().length > 0)
      if (value) {
        return value.trim()
      }
    }

    return null
  }
}
