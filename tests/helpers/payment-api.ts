import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';

import type { ApiError, CapturedPayment, CreatedPayment, Payment, PaymentList, Refund } from './types';

export interface CreatePaymentInput {
  amount: number;
  payment_method: string;
  currency?: string;
  capture_method?: 'automatic' | 'manual';
  customer_email?: string;
  description?: string;
  idempotency_key?: string;
}

export class PaymentApi {
  constructor(private readonly request: APIRequestContext) {}

  create(data: CreatePaymentInput | Record<string, unknown>): Promise<APIResponse> {
    return this.request.post('/api/payments', { data });
  }

  list(params?: Record<string, string | number>): Promise<APIResponse> {
    return this.request.get('/api/payments', { params });
  }

  get(id: string): Promise<APIResponse> {
    return this.request.get(`/api/payments/${id}`);
  }

  capture(id: string, data?: { amount?: number }): Promise<APIResponse> {
    return this.request.post(`/api/payments/${id}/capture`, data ? { data } : undefined);
  }

  refund(id: string, data?: { amount?: number; reason?: string }): Promise<APIResponse> {
    return this.request.post(`/api/payments/${id}/refund`, data ? { data } : undefined);
  }
}

export async function expectJson<T>(response: APIResponse, status: number): Promise<T> {
  const body = await response.text();
  expect(response.status(), body).toBe(status);

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`Expected a JSON response but received: ${body}`);
  }
}

export async function expectApiError(
  response: APIResponse,
  status: number,
  type: string,
): Promise<ApiError> {
  const body = await expectJson<ApiError>(response, status);
  expect(body.error.type).toBe(type);
  expect(body.error.message).toEqual(expect.any(String));
  expect(body.error.message.length).toBeGreaterThan(0);
  return body;
}

export async function createSuccessfulPayment(
  api: PaymentApi,
  overrides: Partial<CreatePaymentInput> = {},
): Promise<CreatedPayment> {
  const response = await api.create({
    amount: 2_000,
    payment_method: 'pm_card_visa',
    customer_email: `qa+${Date.now()}@example.com`,
    ...overrides,
  });
  return expectJson<CreatedPayment>(response, 201);
}

export type { ApiError, CapturedPayment, CreatedPayment, Payment, PaymentList, Refund };
