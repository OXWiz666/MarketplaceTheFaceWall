import { z } from "zod";
import { paymentErrorResponse, PaymentError, readPaymentRequest, sellerEmail, verifyBrowserRequest } from "@/lib/stripe/config";
import { rememberSeller, selectedSellerEmail, startSellerOnboarding } from "@/lib/stripe/sellers";

const schema = z.object({ action: z.literal("onboard"), email: sellerEmail.optional() }).strict();

export async function POST(request: Request) {
  try {
    verifyBrowserRequest(request, "connect", 10);
    const body = await readPaymentRequest(request, schema);
    const selected = await selectedSellerEmail();
    const email = body.email ?? selected;
    if (!email) throw new PaymentError("Enter the email used on your Marketplace listing.", 400);
    const url = await startSellerOnboarding(email);
    await rememberSeller(email);
    return Response.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return paymentErrorResponse(error, "connect"); }
}

