export type PaymentStatus =
  | 'succeeded'
  | 'requires_capture'
  | 'requires_action'
  | 'failed'
  | 'canceled'
  | 'refunded';

export interface Payment {
  id: string;
  stripe_pi_id: string;
  amount: number;
  currency: 'usd';
  status: PaymentStatus;
  capture_method: 'automatic' | 'manual';
  customer_email: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatedPayment extends Payment {
  client_secret: string;
}

export interface CapturedPayment extends Payment {
  captured_amount: number;
}

export interface PaymentList {
  payments: Payment[];
  total: number;
  page: number;
  limit: number;
}

export interface Refund {
  id: string;
  payment_id: string;
  stripe_refund_id: string;
  amount: number;
  status: 'succeeded';
  reason: string | null;
  created_at: string;
}

export interface ApiError {
  error: {
    type: string;
    message: string;
    code?: string;
    decline_code?: string;
  };
}
