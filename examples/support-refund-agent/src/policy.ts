import { allow, ask, deny } from 'nominee'

export interface RefundInput {
  amount: number
  orderId: string
}

export const refundRules = [
  allow<RefundInput>('support.refund', { when: ({ input }) => (input?.amount ?? 0) <= 50 }),
  ask<RefundInput>('support.refund', { when: ({ input }) => (input?.amount ?? 0) <= 500 }),
  deny('support.refund'),
]
