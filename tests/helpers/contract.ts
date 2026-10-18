import { expect } from '@playwright/test';
import Ajv, { type AnySchema, type ValidateFunction } from 'ajv';

import capturedPaymentSchema from '../schemas/captured-payment.schema.json';
import createdPaymentSchema from '../schemas/created-payment.schema.json';
import errorSchema from '../schemas/error.schema.json';
import healthSchema from '../schemas/health.schema.json';
import paymentListSchema from '../schemas/payment-list.schema.json';
import paymentSchema from '../schemas/payment.schema.json';
import refundSchema from '../schemas/refund.schema.json';

export type SchemaName =
  | 'payment'
  | 'createdPayment'
  | 'capturedPayment'
  | 'paymentList'
  | 'refund'
  | 'error'
  | 'health';

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
ajv.addFormat('date-time', (value: string) => value.endsWith('Z') && !Number.isNaN(Date.parse(value)));

const schemas: Record<SchemaName, AnySchema> = {
  payment: paymentSchema,
  createdPayment: createdPaymentSchema,
  capturedPayment: capturedPaymentSchema,
  paymentList: paymentListSchema,
  refund: refundSchema,
  error: errorSchema,
  health: healthSchema,
};

for (const schema of Object.values(schemas)) {
  ajv.addSchema(schema);
}

const validators = new Map<SchemaName, ValidateFunction>();

export function expectSchema(name: SchemaName, body: unknown): void {
  let validate = validators.get(name);
  if (!validate) {
    validate = ajv.getSchema((schemas[name] as { $id: string }).$id);
    if (!validate) throw new Error(`Schema is not registered: ${name}`);
    validators.set(name, validate);
  }

  const valid = validate(body);
  expect(valid, ajv.errorsText(validate.errors, { separator: '\n' })).toBe(true);
}
