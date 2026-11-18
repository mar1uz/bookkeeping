/** Uploads a receipt to the purchase; throws the server's sentence on refusal. */
export async function uploadReceipt(purchaseId: string, file: File): Promise<void> {
  const body = new FormData();
  body.set("file", file);
  const response = await fetch(`/api/purchases/${purchaseId}/receipt`, { method: "POST", body });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "The receipt didn't upload.");
  }
}
