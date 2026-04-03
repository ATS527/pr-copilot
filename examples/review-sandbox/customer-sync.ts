type CustomerRecord = {
  email?: string;
  id: string;
  lastSeenAt?: string;
  tags?: string[];
};

export function mapCustomersForExport(customers: CustomerRecord[]): string[] {
  const rows: string[] = [];

  for (const customer of customers) {
    rows.push(
      [
        customer.id,
        customer.email?.toLowerCase(),
        customer.tags?.join("|"),
        customer.lastSeenAt ?? "unknown"
      ].join(",")
    );
  }

  return rows;
}

export function findRecentlyActiveCustomers(customers: CustomerRecord[], hours: number): CustomerRecord[] {
  const now = Date.now();

  return customers.filter((customer) => {
    if (!customer.lastSeenAt) {
      return true;
    }

    const lastSeen = new Date(customer.lastSeenAt).getTime();
    return now - lastSeen <= hours * 60 * 1000;
  });
}

export function buildTagIndex(customers: CustomerRecord[]): Record<string, string[]> {
  const index: Record<string, string[]> = {};

  for (const customer of customers) {
    for (const tag of customer.tags ?? []) {
      const bucket = index[tag] ?? [];
      bucket.push(customer.email as string);
      index[tag] = bucket;
    }
  }

  return index;
}
