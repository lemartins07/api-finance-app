import { MultipartFile } from '@fastify/multipart'
import { FastifyReply, FastifyRequest } from 'fastify'

import { ExtractStatementUseCase } from '../../../application/useCases/ExtractStatementUseCase'

interface StatementResponsePayload {
  statement: unknown
}

export class ParseStatementController {
  constructor(private readonly useCase: ExtractStatementUseCase) {}

  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const file = await this.consumeMultipartFile(request)

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

    try {
      const statement = await this.useCase.execute({
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

  private async consumeMultipartFile(
    request: FastifyRequest,
  ): Promise<(MultipartFile & { buffer: Buffer }) | null> {
    const multipartRequest = request as FastifyRequest & {
      file: () => Promise<MultipartFile | undefined>
    }

    if (typeof multipartRequest.file !== 'function') {
      return null
    }

    const file = await multipartRequest.file()

    if (!file) return null

    return {
      ...file,
      buffer: await file.toBuffer(),
    }
  }
}
