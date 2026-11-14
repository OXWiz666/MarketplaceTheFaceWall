import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/marketplace";

export function OrderSummary({ order }: { order: { id: string; title: string; image: string; amount: number; listingId: string } }) {
  return <div className="payment-summary">
    <Image src={order.image} alt="" width={80} height={80} unoptimized/>
    <div><h2><Link href={`/marketplace/${order.listingId}`}>{order.title}</Link></h2>
      <p>{formatPrice(order.amount / 100)}</p><small>Order {order.id}</small></div>
  </div>;
}

