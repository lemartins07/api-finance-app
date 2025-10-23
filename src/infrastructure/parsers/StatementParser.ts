import { LocalStatementParserResult } from './pdf/LocalStatementParser'

export type StatementParserResult = LocalStatementParserResult

export interface StatementParser {
  parse(buffer: Buffer): Promise<StatementParserResult>
}
