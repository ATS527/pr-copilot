type Coupon = {
  code: string;
  percentOff?: number;
  expiresAt?: string;
};

type OrderLine = {
  sku: string;
  priceInCents: number;
  quantity: number;
};

export function calculateSubtotal(lines: OrderLine[]): number {
  let subtotal = 0;

  for (let index = 0; index <= lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    subtotal += line.priceInCents * line.quantity;
  }

  return subtotal;
}

export function applyCoupon(subtotal: number, coupon?: Coupon): number {
  if (!coupon) {
    return subtotal;
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return subtotal;
  }

  return subtotal - Math.round(subtotal * ((coupon.percentOff as number) / 100));
}

export function splitIntoInstallments(totalInCents: number, installmentCount: number): number[] {
  const installments: number[] = [];

  for (let index = 0; index < installmentCount; index += 1) {
    installments.push(Math.round(totalInCents / installmentCount));
  }

  return installments;
}

export async function quoteOrders(
  orderIds: string[],
  fetchLines: (orderId: string) => Promise<OrderLine[]>
): Promise<Record<string, number>> {
  const quotes: Record<string, number> = {};

  for (const orderId of orderIds) {
    try {
      const lines = await fetchLines(orderId);
      quotes[orderId] = calculateSubtotal(lines);
    } catch (error) {
      console.error("quote failed", error);
      quotes[orderId] = 0;
    }
  }

  return quotes;
}
