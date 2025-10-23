import multipart from '@fastify/multipart'
import fastify, { FastifyInstance } from 'fastify'

import { ExtractStatementUseCase } from '../application/useCases/ExtractStatementUseCase'
import { ParseStatementController } from '../infrastructure/http/controllers/ParseStatementController'
import { registerStatementRoutes } from '../infrastructure/http/routes/statementRoutes'
import { LocalStatementExtractionService } from '../infrastructure/services'

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: true,
  })

  app.register(multipart, {
    attachFieldsToBody: false,
    limits: {
      fileSize: 15 * 1024 * 1024, // 15MB
    },
  })

  const extractionService = new LocalStatementExtractionService()

  const extractStatementUseCase = new ExtractStatementUseCase(extractionService)
  const parseStatementController = new ParseStatementController(
    extractStatementUseCase,
  )

  registerStatementRoutes(app, parseStatementController)

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
