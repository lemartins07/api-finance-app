import { NormalizedTextChunk, NormalizedTextLine } from '../../src/infrastructure/parsers/pdf/PdfTextNormalizer'
import { Pdf2JsonDocument } from '../../src/infrastructure/parsers/pdf/Pdf2JsonExtractor'

function chunk(text: string, x: number, y: number): NormalizedTextChunk {
  return {
    page: 1,
    text,
    x,
    y,
    width: Math.max(text.length, 4),
    spacing: 0.5,
  }
}

function line(y: number, texts: string[]): NormalizedTextLine {
  const chunks = texts.map((text, index) => chunk(text, 10 + index * 40, y + index * 0.05))
  const fullText = texts.join(' ').replace(/\s+/g, ' ').trim()
  return {
    page: 1,
    y,
    text: fullText,
    chunks,
  }
}

export const c6BankPdfDocument: Pdf2JsonDocument = {
  Pages: [
    {
      Width: 600,
      Height: 800,
      PageNumber: 1,
      Texts: [],
    },
  ],
}

export const c6BankNormalizedLines: NormalizedTextLine[] = [
  line(10, ['LEANDRO', 'AZEVEDO', 'MARTINS']),
  line(12, ['Período', 'até', '15/01/2025']),
  line(14, ['Vencimento:', '20/01/2025']),
  line(16, ['Valor', 'da', 'fatura:', 'R$', '2.000,00']),
  line(18, ['Pagamento', 'mínimo', 'R$', '200,00']),
  line(20, ['NOSSO', 'NÚMERO', '123456789']),
  line(30, ['Transações', 'do', 'cartão', 'principal']),
  {
    page: 1,
    y: 32,
    text:
      'Subtotal deste cartão R$ 1.500,00 Cartão Principal - LEANDRO AZEVEDO Final 1111 Mastercard',
    chunks: [
      chunk('Subtotal deste cartão', 10, 32),
      chunk('R$ 1.500,00', 80, 32.05),
      chunk('Cartão Principal - LEANDRO AZEVEDO Final 1111', 120, 32.1),
      chunk('Mastercard', 250, 32.15),
    ],
  },
  line(34, ['Valores', 'em', 'reais']),
  {
    page: 1,
    y: 36,
    text: '05 jan Supermercado Central 600,00',
    chunks: [
      chunk('05 jan', 10, 36),
      chunk('Supermercado', 60, 36.05),
      chunk('Central', 100, 36.1),
      chunk('600,00', 200, 36.15),
    ],
  },
  {
    page: 1,
    y: 38,
    text: '10 jan Loja Online 900,00',
    chunks: [
      chunk('10 jan', 10, 38),
      chunk('Loja', 60, 38.05),
      chunk('Online', 100, 38.1),
      chunk('900,00', 200, 38.15),
    ],
  },
  line(42, ['Transações', 'dos', 'cartões', 'adicionais']),
  {
    page: 1,
    y: 44,
    text:
      'Subtotal deste cartão R$ 500,00 Cartão Adicional - MARIA AZEVEDO Final 2222 Visa',
    chunks: [
      chunk('Subtotal deste cartão', 10, 44),
      chunk('R$ 500,00', 80, 44.05),
      chunk('Cartão Adicional - MARIA AZEVEDO Final 2222', 120, 44.1),
      chunk('Visa', 250, 44.15),
    ],
  },
  line(46, ['Valores', 'em', 'reais']),
  {
    page: 1,
    y: 48,
    text: '12 jan Restaurante Legal 500,00',
    chunks: [
      chunk('12 jan', 10, 48),
      chunk('Restaurante', 60, 48.05),
      chunk('Legal', 110, 48.1),
      chunk('500,00', 200, 48.15),
    ],
  },
]
