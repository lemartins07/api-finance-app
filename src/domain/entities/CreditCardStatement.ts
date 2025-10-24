export type TransactionType =
  | 'purchase'
  | 'installment'
  | 'payment'
  | 'refund'
  | 'fee'
  | 'adjustment'
  | null

export interface TransactionInstallmentInfo {
  current: number | null
  total: number | null
}

export interface StatementTransaction {
  /** Data no formato ISO (YYYY-MM-DD) */
  date: string | null
  description: string | null
  amount: number | null
  currency: string
  transaction_type: TransactionType
  inferred_category: string | null
  installment: TransactionInstallmentInfo
}

export interface StatementCard {
  card_type: string | null
  last4_digits: string | null
  cardholder: string | null
  is_additional: boolean | null
  card_subtotal: number | null
  transactions: StatementTransaction[]
}

export interface CreditCardStatement {
  cardholder_name: string | null
  main_card_last4: string | null
  due_date: string | null
  closing_date: string | null
  total_amount_due: number | null
  minimum_payment: number | null
  best_purchase_day: number | null
  auto_debit: 'Enabled' | 'Disabled' | null
  annual_fee: string | null
  credit_limit: number | null
  available_limit: number | null
  cards: StatementCard[]
  metadata?: Record<string, unknown>
}
