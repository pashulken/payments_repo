import { expect, type Page } from '@playwright/test';

export class PaymentsPage {
  constructor(private readonly page: Page) {}

  async expectPayment(paymentId: string, status: string): Promise<void> {
    await this.page.goto('/payments');
    await expect(this.page.getByTestId('payments-table')).toBeVisible();
    const row = this.page.getByTestId('payment-row').filter({ hasText: paymentId });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('payment-status')).toHaveText(status);
  }
}
