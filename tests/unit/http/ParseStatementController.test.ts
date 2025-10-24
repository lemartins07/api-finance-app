import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { ExtractStatementUseCase } from '../../../src/application/useCases/ExtractStatementUseCase'
import { ParseStatementController } from '../../../src/infrastructure/http/controllers/ParseStatementController'

function createReplyMock() {
  type ReplyShape = Pick<FastifyReply, 'status' | 'send'>

  const replyRef: { current: FastifyReply | null } = { current: null }

  const statusMock = vi.fn((statusCode: number) => {
    if (typeof statusCode !== 'number') {
      throw new TypeError('status code must be a number')
    }
    return replyRef.current as FastifyReply
  })
  const sendMock = vi.fn((payload: unknown) => {
    if (payload === undefined) {
      throw new TypeError('payload must be provided')
    }
    return replyRef.current as FastifyReply
  })

  const replyShape: ReplyShape = {
    status: statusMock as unknown as ReplyShape['status'],
    send: sendMock as unknown as ReplyShape['send'],
  }

  replyRef.current = replyShape as unknown as FastifyReply

  return {
    reply: replyRef.current,
    status: statusMock,
    send: sendMock,
  }
}

function createRequestMock(overrides?: {
  headers?: FastifyRequest['headers']
  query?: FastifyRequest['query']
}): FastifyRequest {
  return {
    log: { error: vi.fn() },
    headers: overrides?.headers ?? {},
    query: overrides?.query,
  } as unknown as FastifyRequest
}

describe('ParseStatementController', () => {
  it('uses the bank provided via multipart payload when available', async () => {
    const useCase = { execute: vi.fn().mockResolvedValue({ ok: true }) } as unknown as ExtractStatementUseCase
    const controller = new ParseStatementController(useCase)
    const file = {
      buffer: Buffer.from('pdf'),
      filename: 'statement.pdf',
      mimetype: 'application/pdf',
    }

    vi
      .spyOn(controller as unknown as { consumeMultipartPayload: () => Promise<unknown> }, 'consumeMultipartPayload')
      .mockResolvedValue({ file, bank: 'c6' })

    const { reply, status, send } = createReplyMock()
    const request = createRequestMock()

    await controller.handle(request, reply)

    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ bank: 'c6', fileBuffer: file.buffer }),
    )
    expect(status).toHaveBeenCalledWith(200)
    expect(send).toHaveBeenCalledWith({ statement: { ok: true } })
  })

  it('falls back to the bank provided via query string', async () => {
    const useCase = { execute: vi.fn().mockResolvedValue({ ok: true }) } as unknown as ExtractStatementUseCase
    const controller = new ParseStatementController(useCase)
    const file = {
      buffer: Buffer.from('pdf'),
      filename: 'statement.pdf',
      mimetype: 'application/pdf',
    }

    vi
      .spyOn(controller as unknown as { consumeMultipartPayload: () => Promise<unknown> }, 'consumeMultipartPayload')
      .mockResolvedValue({ file, bank: null })

    const { reply, status, send } = createReplyMock()
    const request = createRequestMock({ query: { bank: ' generic ' } })

    await controller.handle(request, reply)

    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ bank: 'generic', fileBuffer: file.buffer }),
    )
    expect(status).toHaveBeenCalledWith(200)
    expect(send).toHaveBeenCalledWith({ statement: { ok: true } })
  })

  it('returns 400 when no bank information is provided', async () => {
    const useCase = { execute: vi.fn() } as unknown as ExtractStatementUseCase
    const controller = new ParseStatementController(useCase)

    vi
      .spyOn(controller as unknown as { consumeMultipartPayload: () => Promise<unknown> }, 'consumeMultipartPayload')
      .mockResolvedValue({ file: { buffer: Buffer.from('pdf'), mimetype: 'application/pdf' }, bank: null })

    const { reply, status, send } = createReplyMock()
    const request = createRequestMock({ query: {} })

    await controller.handle(request, reply)

    expect(useCase.execute).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(400)
    expect(send).toHaveBeenCalledWith({ message: "Campo 'bank' é obrigatório." })
  })
})
