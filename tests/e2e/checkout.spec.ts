import { test } from '@playwright/test';

import { CheckoutPage } from '../pages/checkout-page';
import { PaymentsPage } from '../pages/payments-page';
import { SuccessPage } from '../pages/success-page';

test.describe('@stripe checkout', () => {
  test.skip(
    process.env.RUN_STRIPE_TESTS !== 'true',
    'Set RUN_STRIPE_TESTS=true and start the service with Stripe test keys.',
  );

  test('completes checkout and shows the payment in history', async ({ page }) => {
    const checkout = new CheckoutPage(page);
    await checkout.open();
    await checkout.pay({
      email: `qa.ui+${Date.now()}@example.com`,
      amount: '50.00',
      cardNumber: '4242424242424242',
    });

    const paymentId = await new SuccessPage(page).paymentId();
    await new PaymentsPage(page).expectPayment(paymentId, 'succeeded');
  });

  test('shows the Stripe decline instead of confirming payment', async ({ page }) => {
    const checkout = new CheckoutPage(page);
    await checkout.open();
    await checkout.pay({
      email: `qa.declined+${Date.now()}@example.com`,
      amount: '50.00',
      cardNumber: '4000000000000002',
    });

    await checkout.expectError(/declined/i);
  });
});
