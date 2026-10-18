import { expect, type Page } from '@playwright/test';

export class CheckoutPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/checkout');
    await expect(this.page.getByTestId('pay-button')).toBeVisible();
  }

  async pay(options: {
    email: string;
    amount: string;
    cardNumber: string;
    manualCapture?: boolean;
  }): Promise<void> {
    await this.page.getByTestId('email').fill(options.email);
    await this.page.getByTestId('amount').fill(options.amount);

    if (options.manualCapture) {
      await this.page.getByTestId('manual-capture').check();
    }

    const cardFrame = this.page.frameLocator('iframe[title*="Secure card payment input frame"]');
    await cardFrame.locator('[name="cardnumber"]').fill(options.cardNumber);
    await cardFrame.locator('[name="exp-date"]').fill('1234');
    await cardFrame.locator('[name="cvc"]').fill('123');
    await this.page.getByTestId('pay-button').click();
  }

  async expectError(message: RegExp): Promise<void> {
    await expect(this.page.getByTestId('error-message')).toContainText(message);
  }
}
