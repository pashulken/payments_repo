import { expect, type Page } from '@playwright/test';

export class SuccessPage {
  constructor(private readonly page: Page) {}

  async paymentId(): Promise<string> {
    await expect(this.page).toHaveURL(/\/success\?payment_id=/);
    await expect(this.page.getByTestId('confirmation')).toBeVisible();
    const id = (await this.page.getByTestId('payment-id').textContent())?.trim();
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    return id as string;
  }
}
