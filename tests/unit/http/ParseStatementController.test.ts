import { describe, expect, it, vi } from 'vitest'

import { ExtractStatementUseCase } from '../../../src/application/useCases/ExtractStatementUseCase'
import { ParseStatementController } from '../../../src/infrastructure/http/controllers/ParseStatementController'

function createReplyMock() {
  const send = vi.fn()
  const reply: Record<string, any> = {}
  reply.status = vi.fn().mockImplementation(() => reply)
  reply.send = send
  return { reply: reply as any, status: reply.status, send }
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
    const request = { log: { error: vi.fn() }, headers: {}, query: undefined } as any

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
    const request = {
      log: { error: vi.fn() },
      headers: {},
      query: { bank: ' generic ' },
    } as any

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
    const request = { log: { error: vi.fn() }, headers: {}, query: {} } as any

    await controller.handle(request, reply)

    expect(useCase.execute).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(400)
    expect(send).toHaveBeenCalledWith({ message: "Campo 'bank' é obrigatório." })
  })
})
