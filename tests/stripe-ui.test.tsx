import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BuyNow } from "@/components/stripe/payment-actions";
import { Confirmation } from "@/components/stripe/checkout-status";

afterEach(cleanup);

describe("Marketplace payment states", () => {
  it("exposes Buy Now only for eligible listings", () => {
    const { rerender } = render(<BuyNow listingId="item" availability="available"/>);
    expect(screen.getByRole("button", { name: "Buy Now" })).toBeEnabled();

    rerender(<BuyNow listingId="item" availability="disabled"/>);
    expect(screen.getByText("Seller has not enabled payments")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Buy Now" })).toBeNull();

    rerender(<BuyNow listingId="item" availability="reserved"/>);
    expect(screen.getByText("Checkout in progress")).toBeVisible();

    rerender(<BuyNow listingId="item" availability="sold"/>);
    expect(screen.getByText("Sold")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Buy Now" })).toBeNull();
  });

  it("shows the paid confirmation only after the order is paid", () => {
    const { unmount } = render(<Confirmation sessionId="session" initialStatus="pending" stripePaid/>);
    expect(screen.getByRole("heading", { name: "Payment received" })).toBeInTheDocument();
    expect(screen.queryByText("Payment status · Paid")).toBeNull();
    unmount();
    render(<Confirmation sessionId="session" initialStatus="paid" stripePaid/>);
    expect(screen.getByText("Payment status · Paid")).toBeInTheDocument();
  });
});

