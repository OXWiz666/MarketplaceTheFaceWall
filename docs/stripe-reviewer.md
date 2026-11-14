# Stripe Connect reviewer notes

The Marketplace uses Stripe Connect in sandbox mode. Listings with an onboarded seller show **Buy Now**. The app keeps prices in PHP and creates the charge on the connected seller account. The default marketplace application fee is **10%**, rounded to the nearest centavo. Seller proceeds shown in the dashboard are before Stripe processing fees.

## Test a purchase

1. Open the active demonstration listing provided with the submission and select **Buy Now**.
2. In Stripe Checkout, use `4242 4242 4242 4242`, a future expiry date, any three-digit CVC, and a test email address.
3. On return, confirm the order shows **Paid**. Reopen or refresh the listing and confirm it shows **Sold**.
4. In Stripe sandbox, open the connected account to inspect the charge and the platform’s application fee. The Marketplace seller dashboard shows the sale, and Supabase stores the corresponding row in `orders`.

The submitter should add the active demo listing URL and seller display details after sandbox setup. Use a separate listing for the reviewer after completing the verification purchase.

