export interface Transaction {
  /** Data no formato ISO (YYYY-MM-DD) */
  date: string | null
  description: string
  amount: number
  currency: string
  category?: string | null
  metadata?: Record<string, unknown>
}

export interface CreditCardStatement {
  cardholder: string | null
  closingDate: string | null
  dueDate: string | null
  invoiceNumber: string | null
  currency: string
  totalAmount: number | null
  minimumPayment: number | null
  transactions: Transaction[]
  rawTextPath?: string | null
  metadata?: Record<string, unknown>
}
