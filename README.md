# Finance App – API de Faturas (Fastify + TypeScript)

API em construção que recebe uma fatura de cartão de crédito em PDF, envia o documento para a API da OpenAI e retorna os dados estruturados em JSON. A solução adota princípios de DDD, SOLID e Arquitetura Limpa para manter as camadas desacopladas.

## Arquitetura

- **Domain**: entidades e contratos (`src/domain`)
- **Application**: casos de uso orquestrando regras (`src/application`)
- **Infrastructure**: integrações externas (OpenAI, HTTP) (`src/infrastructure`)
- **Main**: composição e inicialização (`src/main`)

## Requisitos

- Node.js 18+
- Variáveis de ambiente em um arquivo `.env`:
  ```bash
  OPENAI_API_KEY=coloque-sua-chave
  OPENAI_MODEL=gpt-4.1-mini # opcional, usa padrão se omitir
  PORT=3333                 # opcional
  ```

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

O servidor inicia com Fastify (logger ativado) e expõe:
- `POST /statements/parse`: recebe `multipart/form-data` com o campo `file` (PDF).
- `GET /health`: checagem simples.

## Build & Produção

```bash
npm run build
npm start
```

O build gera os arquivos compilados em `dist/`.

## Fluxo do caso de uso

1. O endpoint recebe o PDF via `@fastify/multipart`.
2. O caso de uso `ExtractStatementUseCase` delega ao serviço `OpenAIStatementExtractionService`.
3. O serviço envia o PDF para a OpenAI utilizando o Responses API com Structured Outputs (JSON Schema).
4. A resposta estruturada é transformada em `CreditCardStatement` e devolvida ao cliente.

## Próximos passos sugeridos

1. Criar testes automatizados (unitários e contract tests simulando a OpenAI).
2. Adicionar persistência dos statements (ex.: PostgreSQL) e versionamento.
3. Implementar autenticação/autorização para o endpoint.
4. Disponibilizar validações adicionais de entrada (tamanho do arquivo, tipos aceitos).
