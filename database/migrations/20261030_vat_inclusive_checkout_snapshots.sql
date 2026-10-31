-- Preserve VAT-exempt sales with the VAT and total captured at checkout.
-- Historical rows remain NULL and continue to use their stored VAT/final amounts.
ALTER TABLE `checkout_records`
  ADD COLUMN `vat_exempt_sales` decimal(12,2) DEFAULT NULL AFTER `vat_amount`;
