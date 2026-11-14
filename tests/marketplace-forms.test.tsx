import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListingForm } from "@/components/listing-form";
import { SellerConnectForm } from "@/components/stripe/seller-connect";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);

describe("Marketplace form feedback", () => {
  it("focuses the missing field and reports invalid descriptions and blank prices inline", () => {
    render(<ListingForm/>);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Test123" } });
    const description = screen.getByLabelText("Description");
    fireEvent.change(description, { target: { value: "Test123" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish listing" }));

    expect(description).toHaveFocus();
    expect(description).toHaveAttribute("aria-invalid", "true");
    expect(description).toHaveAccessibleDescription("At least 10 characters Use at least 10 characters.");
    expect(screen.getByLabelText("Price in PHP")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Add a photo for your listing.")).toBeVisible();

    fireEvent.change(description, { target: { value: "In good condition." } });
    expect(description).not.toHaveAttribute("aria-invalid");
  });

  it("shows a seller email error without making an invalid request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      render(<SellerConnectForm initialEmail="invalid"/>);
      fireEvent.click(screen.getByRole("button", { name: "Connect with Stripe" }));
      const email = screen.getByLabelText("Seller email");
      expect(email).toHaveFocus();
      expect(email).toHaveAccessibleDescription(/Enter a valid email address/);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
