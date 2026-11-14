import { z } from "zod";
import { paymentErrorResponse, readPaymentRequest, verifyBrowserRequest } from "@/lib/stripe/config";
import { startCheckout } from "@/lib/stripe/checkout";

const schema = z.object({ listingId: z.uuid(), attemptId: z.uuid() }).strict();

export async function POST(request: Request) {
  try {
    verifyBrowserRequest(request, "checkout");
    const { listingId, attemptId } = await readPaymentRequest(request, schema);
    return Response.json({ url: await startCheckout(listingId, attemptId) });
  } catch (error) { return paymentErrorResponse(error, "checkout"); }
}

