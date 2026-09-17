export async function importProductionStockOpeningBalancesRequest(payload) {
  const response = await fetch("/api/production-stock/opening-balances/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      String(responseBody?.error || "ไม่สามารถนำเข้ายอดยกมาได้ในขณะนี้")
    );
  }

  return responseBody;
}
