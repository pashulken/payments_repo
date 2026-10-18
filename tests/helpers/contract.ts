import { expect } from '@playwright/test';
import Ajv, { type AnySchema, type ValidateFunction } from 'ajv';

import cardErrorSchema from '../schemas/card-error.schema.json';
import capturedPaymentSchema from '../schemas/captured-payment.schema.json';
import configSchema from '../schemas/config.schema.json';
import createdPaymentSchema from '../schemas/created-payment.schema.json';
import errorSchema from '../schemas/error.schema.json';
import healthSchema from '../schemas/health.schema.json';
import paymentListSchema from '../schemas/payment-list.schema.json';
import paymentSchema from '../schemas/payment.schema.json';
import refundSchema from '../schemas/refund.schema.json';
import webhookAckSchema from '../schemas/webhook-ack.schema.json';

export type SchemaName =
  | 'payment'
  | 'createdPayment'
  | 'capturedPayment'
  | 'paymentList'
  | 'refund'
  | 'error'
  | 'cardError'
  | 'health'
  | 'config'
  | 'webhookAck';

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
  cardError: cardErrorSchema,
  health: healthSchema,
  config: configSchema,
  webhookAck: webhookAckSchema,
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
  const errors = validate.errors
    ?.map((error) => `${error.instancePath || '/'} ${error.message} ${JSON.stringify(error.params)}`)
    .join('\n');
  expect.soft(valid, errors).toBe(true);
}
