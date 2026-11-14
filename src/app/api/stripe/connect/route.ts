import { z } from "zod";
import { paymentErrorResponse, PaymentError, readPaymentRequest, sellerEmail, verifyBrowserRequest } from "@/lib/stripe/config";
import { getSeller, rememberSeller, selectedSellerEmail, startSellerOnboarding } from "@/lib/stripe/sellers";

const schema = z.object({ action: z.literal("onboard"), email: sellerEmail.optional() }).strict();

export async function POST(request: Request) {
  try {
    verifyBrowserRequest(request, "connect", 10);
    const body = await readPaymentRequest(request, schema);
    const selected = await selectedSellerEmail();
    const email = body.email ?? selected;
    if (!email) throw new PaymentError("Enter the email used on your Marketplace listing.", 400);
    if (selected && selected !== email) throw new PaymentError("Continue with the seller already connected in this browser.", 403);
    const existing = await getSeller("email", email);
    if (existing?.stripe_account_id && selected !== email) {
      throw new PaymentError("This seller is already connected. Continue in the browser used for setup.", 403);
    }
    const url = await startSellerOnboarding(email);
    await rememberSeller(email);
    return Response.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return paymentErrorResponse(error, "connect"); }
}

