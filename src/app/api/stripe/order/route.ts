import { z } from "zod";
import { paymentErrorResponse, paymentSessionId, readPaymentRequest, verifyBrowserRequest } from "@/lib/stripe/config";
import { cancelCheckout, findOrder, verifyCheckoutReturn } from "@/lib/stripe/checkout";

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), sessionId: paymentSessionId }).strict(),
  z.object({ action: z.literal("cancel"), attemptId: z.uuid() }).strict(),
]);

export async function POST(request: Request) {
  try {
    verifyBrowserRequest(request, "order", 20);
    const body = await readPaymentRequest(request, action);
    if (body.action === "confirm") {
      const order = await verifyCheckoutReturn(body.sessionId, true);
      return order ? Response.json({ order }) : Response.json({ error: "Order not found." }, { status: 404 });
    }
    const order = await findOrder("attempt_id", body.attemptId);
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    return Response.json({ status: await cancelCheckout(order) });
  } catch (error) { return paymentErrorResponse(error, "order"); }
}

