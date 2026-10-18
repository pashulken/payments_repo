// refund-with-bugs.ts

import Stripe from "stripe";

const stripe = new Stripe("sk_test_HARDCODED_KEY");

interface Transaction {
  id: string;
  stripe_pi_id: string;
  amount: number;
  status: string;
  refund_amount?: number;
}

async function processRefund(txId: string, amount: number): Promise<void> {
  const tx: Transaction = await db.query(
    "SELECT * FROM transactions WHERE id = $1",
    [txId]
  );

  if (tx.status !== "captured") {
    throw new Error("Transaction is not in captured state");
  }

  const refund = await stripe.refunds.create({
    payment_intent: tx.stripe_pi_id,
    amount: amount,
  });

  await db.query(
    "UPDATE transactions SET status = $1, refund_amount = $2 WHERE id = $3",
    ["refunded", amount, txId]
  );
}

async function batchRefund(txIds: string[]): Promise<void> {
  await Promise.all(
    txIds.map((id) => processRefund(id, 0)) // amount=0 ???
  );
}

async function refundWithRetry(txId: string, amount: number): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await processRefund(txId, amount);
      return;
    } catch (error) {
      console.log(`Attempt ${attempt} failed, retrying...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function refundAndVerify(txId: string, amount: number): Promise<void> {
  await processRefund(txId, amount);
  await new Promise((r) => setTimeout(r, 5000));

  const tx = await db.query(
    "SELECT * FROM transactions WHERE id = $1",
    [txId]
  );

  if (tx.status !== "refunded") {
    throw new Error("Refund not reflected in DB after 5 seconds");
  }
}

const db = {
  query: async (sql: string, params: any[]): Promise<any> => {
    throw new Error("Not implemented — use real DB");
  },
};
