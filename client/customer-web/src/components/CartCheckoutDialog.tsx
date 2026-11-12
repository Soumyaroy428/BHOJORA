import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_TIP_PRESETS_PAISE,
  formatInrFromPaise,
  type CartDto,
  type CheckoutQuoteDto,
  type PublicCouponSummaryDto,
} from '@bhojora/shared';
import { useDialogLightDismiss } from '../hooks/useDialogLightDismiss';
import { KOLKATA_QUOTE_LOCATIONS } from '../lib/cartHelpers';
import type { KolkataZoneId } from '../types/domain';
import { DietaryBadge } from './DietaryBadge';

interface CartCheckoutDialogProps {
  open: boolean;
  cart: CartDto;
  quote: CheckoutQuoteDto | null;
  availableCoupons: readonly PublicCouponSummaryDto[];
  selectedLocationId: Exclude<KolkataZoneId, 'all'>;
  couponInput: string;
  tipPaise: number;
  quoteLoading: boolean;
  quoteError: string | null;
  placingOrder: boolean;
  orderError: string | null;
  isLiveServerMode: boolean;
  onSelectLocation: (locId: Exclude<KolkataZoneId, 'all'>) => void;
  onChangeCouponInput: (code: string) => void;
  onApplyCoupon: (code: string) => void;
  onChangeTipPaise: (tipPaise: number) => void;
  onUpdateItemQty: (cartItemId: string, nextQty: number) => void;
  onClearCart: () => void;
  onGenerateQuote: (acceptPriceChanges?: boolean) => void;
  onPlaceOrder: (specialInstructions: string) => void;
  onOpenAuthModal: () => void;
  onClose: () => void;
}

function formatCountdown(seconds: number): string {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.max(0, seconds) % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function CartCheckoutDialog({
  open,
  cart,
  quote,
  availableCoupons,
  selectedLocationId,
  couponInput,
  tipPaise,
  quoteLoading,
  quoteError,
  placingOrder,
  orderError,
  isLiveServerMode,
  onSelectLocation,
  onChangeCouponInput,
  onApplyCoupon,
  onChangeTipPaise,
  onUpdateItemQty,
  onClearCart,
  onGenerateQuote,
  onPlaceOrder,
  onOpenAuthModal,
  onClose,
}: CartCheckoutDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  useDialogLightDismiss(dialogRef);

  const [secondsLeft, setSecondsLeft] = useState<number>(quote?.remainingSeconds ?? 0);
  const [specialInstructions, setSpecialInstructions] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!quote) {
      setSecondsLeft(0);
      return;
    }
    const updateRemaining = () => {
      const diffSec = Math.max(
        0,
        Math.ceil((new Date(quote.expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(diffSec);
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [quote]);

  const quoteExpired = quote !== null && (quote.isExpired || secondsLeft <= 0);

  return (
    <dialog
      ref={dialogRef}
      id="cartCheckoutModal"
      className="trust-dialog cart-dialog"
      closedby="any"
      aria-labelledby="cartModalTitle"
      onClose={onClose}
    >
      <div className="modal-header">
        <div>
          <h2 id="cartModalTitle" style={{ fontSize: '18px' }}>
            Your Order Cart &amp; Authoritative Quote
          </h2>
          <p className="menu-source-note">
            {isLiveServerMode
              ? 'Server-signed HMAC-SHA256 quote (600s validity · INR integer paise).'
              : 'Kolkata preview quote (identical integer paise math; server-signed when API session active).'}
          </p>
        </div>
        <form method="dialog">
          <button type="submit" className="modal-close" aria-label="Close cart and quote dialog">
            &times;
          </button>
        </form>
      </div>

      {cart.items.length === 0 ? (
        <div className="cart-empty-state" role="status" aria-live="polite">
          <p style={{ fontWeight: 700, color: 'var(--neutral-950)', marginBottom: '6px' }}>
            Your cart is empty
          </p>
          <p style={{ fontSize: '13px', color: 'var(--neutral-600)', marginBottom: '16px' }}>
            Open any Kolkata kitchen menu to add dishes with declared allergens and portion options.
            Single-outlet cart policy applies per order.
          </p>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Browse Kolkata Kitchens
          </button>
        </div>
      ) : (
        <div className="cart-stack">
          <div className="cart-outlet-banner">
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--neutral-950)' }}>
                {cart.brandName} ({cart.outletName})
              </div>
              <div style={{ fontSize: '12px', color: 'var(--neutral-600)' }}>
                Single-outlet cart active · {cart.itemCount} item(s) · Subtotal{' '}
                {cart.formattedSubtotalInr}
              </div>
            </div>
            <button
              type="button"
              id="clearCartBtn"
              className="btn btn-outline"
              style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12px' }}
              onClick={onClearCart}
            >
              Clear Cart
            </button>
          </div>

          <ul className="cart-item-list" aria-label="Cart items">
            {cart.items.map((item) => (
              <li key={item.cartItemId} className="cart-line-row">
                <div className="cart-line-info">
                  <DietaryBadge dietaryType={item.dietaryType} />
                  <div className="cart-line-title">{item.title}</div>
                  {item.selectedVariants.length > 0 || item.selectedAddons.length > 0 ? (
                    <div className="cart-line-options">
                      {[
                        ...item.selectedVariants.map((v) => v.label),
                        ...item.selectedAddons.map((a) => `+ ${a.label}`),
                      ].join(' · ')}
                    </div>
                  ) : null}
                  {item.currentPriceChanged ? (
                    <div className="cart-drift-chip">
                      Menu price updated from {formatInrFromPaise(item.priceAtAddPaise)} to{' '}
                      {formatInrFromPaise(item.effectiveUnitPricePaise)}
                    </div>
                  ) : null}
                </div>

                <div className="cart-qty-controls">
                  <button
                    type="button"
                    className="btn btn-outline cart-qty-btn"
                    aria-label={`Decrease quantity of ${item.title}`}
                    onClick={() => onUpdateItemQty(item.cartItemId, item.quantity - 1)}
                  >
                    −
                  </button>
                  <span className="cart-qty-count" aria-label={`Quantity ${item.quantity}`}>
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline cart-qty-btn"
                    aria-label={`Increase quantity of ${item.title}`}
                    onClick={() => onUpdateItemQty(item.cartItemId, item.quantity + 1)}
                  >
                    +
                  </button>
                  <strong className="cart-line-total">{item.formattedLineTotalInr}</strong>
                </div>
              </li>
            ))}
          </ul>

          <div className="cart-section-box">
            <label htmlFor="cartDeliveryLocSelect" className="cart-field-label">
              Delivery Location (Kolkata Service Zone)
            </label>
            <select
              id="cartDeliveryLocSelect"
              className="discovery-select cart-select"
              value={selectedLocationId}
              onChange={(event) =>
                onSelectLocation(event.target.value as Exclude<KolkataZoneId, 'all'>)
              }
            >
              {KOLKATA_QUOTE_LOCATIONS.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.label} — {loc.streetAddress} (Base fee{' '}
                  {formatInrFromPaise(loc.deliveryBaseFeePaise)})
                </option>
              ))}
            </select>
          </div>

          <div className="cart-section-box">
            <label htmlFor="cartCouponCodeInput" className="cart-field-label">
              Promo Code (Transparent Funding Split)
            </label>
            <div className="cart-coupon-row">
              <input
                id="cartCouponCodeInput"
                type="text"
                className="cart-text-input"
                maxLength={32}
                placeholder="Enter coupon (e.g. BHOJORA100)"
                value={couponInput}
                onChange={(event) => onChangeCouponInput(event.target.value.toUpperCase())}
              />
              <button
                type="button"
                id="applyCouponBtn"
                className="btn btn-primary"
                style={{ minHeight: '44px' }}
                onClick={() => onApplyCoupon(couponInput)}
              >
                Apply
              </button>
            </div>
            <div className="cart-coupon-pills" role="group" aria-label="Available promo offers">
              {availableCoupons.map((coupon) => (
                <button
                  key={coupon.code}
                  type="button"
                  className={
                    couponInput.trim().toUpperCase() === coupon.code ? 'chip active' : 'chip'
                  }
                  onClick={() => {
                    onChangeCouponInput(coupon.code);
                    onApplyCoupon(coupon.code);
                  }}
                >
                  {coupon.code} ({coupon.fundingSummaryLabel})
                </button>
              ))}
            </div>
          </div>

          <div className="cart-section-box">
            <div className="cart-field-label">
              Delivery Partner Tip (100% pass-through · Untaxed)
            </div>
            <div className="cart-tip-row" role="group" aria-label="Select delivery partner tip">
              {DEFAULT_TIP_PRESETS_PAISE.map((presetPaise) => (
                <button
                  key={presetPaise}
                  type="button"
                  className={tipPaise === presetPaise ? 'chip active' : 'chip'}
                  aria-pressed={tipPaise === presetPaise}
                  onClick={() => onChangeTipPaise(presetPaise)}
                >
                  {presetPaise === 0 ? 'No Tip' : formatInrFromPaise(presetPaise)}
                </button>
              ))}
            </div>
          </div>

          {quoteError ? (
            <div className="cart-error-banner" role="alert">
              {quoteError}
            </div>
          ) : null}

          {quote?.priceDriftDetected && quote.priceDriftWarnings.length > 0 ? (
            <div className="cart-drift-alert" role="alert">
              <strong>Menu Price Updated While Building Cart</strong>
              {quote.priceDriftWarnings.map((warning) => (
                <p key={warning.menuItemId} style={{ marginTop: '4px', fontSize: '12px' }}>
                  {warning.message}
                </p>
              ))}
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: '8px', minHeight: '44px' }}
                onClick={() => onGenerateQuote(true)}
              >
                Accept Updated Total ({quote.pricingBreakdown.formattedTotalPayableInr})
              </button>
            </div>
          ) : null}

          {quote ? (
            <section
              className="quote-summary-card"
              aria-label="Authoritative Checkout Quote Breakdown"
            >
              <div className="quote-header-bar">
                <strong>Bill Breakdown ({quote.distanceMeters}m away)</strong>
                <span
                  className={`quote-ttl-pill ${quoteExpired ? 'is-expired' : 'is-valid'}`}
                  aria-live="polite"
                >
                  {quoteExpired
                    ? 'Quote Expired (600s elapsed)'
                    : `Valid ${formatCountdown(secondsLeft)}`}
                </span>
              </div>

              <dl className="quote-ledger">
                <div className="quote-ledger-row">
                  <dt>Items Subtotal</dt>
                  <dd>{formatInrFromPaise(quote.pricingBreakdown.itemsSubtotalPaise)}</dd>
                </div>
                {quote.pricingBreakdown.discountPaise > 0 ? (
                  <div className="quote-ledger-row is-discount">
                    <dt>
                      Promo Discount ({quote.couponAllocation?.couponCode})
                      <span className="quote-split-note">
                        {quote.couponAllocation?.fundingSummaryLabel} · Platform{' '}
                        {formatInrFromPaise(quote.couponAllocation?.platformFundedPaise ?? 0)} /
                        Kitchen{' '}
                        {formatInrFromPaise(quote.couponAllocation?.restaurantFundedPaise ?? 0)}
                      </span>
                    </dt>
                    <dd>−{formatInrFromPaise(quote.pricingBreakdown.discountPaise)}</dd>
                  </div>
                ) : null}
                <div className="quote-ledger-row">
                  <dt>Packaging Charge</dt>
                  <dd>{formatInrFromPaise(quote.pricingBreakdown.packagingChargePaise)}</dd>
                </div>
                <div className="quote-ledger-row">
                  <dt>
                    Delivery Fee (Base{' '}
                    {formatInrFromPaise(quote.pricingBreakdown.deliveryBaseFeePaise)} + Distance{' '}
                    {formatInrFromPaise(quote.pricingBreakdown.deliveryDistanceFeePaise)})
                  </dt>
                  <dd>{formatInrFromPaise(quote.pricingBreakdown.deliveryFeePaise)}</dd>
                </div>
                <div className="quote-ledger-row">
                  <dt>Platform Fee</dt>
                  <dd>{formatInrFromPaise(quote.pricingBreakdown.platformFeePaise)}</dd>
                </div>
                <div className="quote-ledger-row">
                  <dt>
                    Taxes &amp; GST (CGST {formatInrFromPaise(quote.pricingBreakdown.cgstPaise)} +
                    SGST {formatInrFromPaise(quote.pricingBreakdown.sgstPaise)})
                  </dt>
                  <dd>{formatInrFromPaise(quote.pricingBreakdown.gstTaxPaise)}</dd>
                </div>
                {quote.pricingBreakdown.tipPaise > 0 ? (
                  <div className="quote-ledger-row">
                    <dt>Delivery Partner Tip (Untaxed)</dt>
                    <dd>{formatInrFromPaise(quote.pricingBreakdown.tipPaise)}</dd>
                  </div>
                ) : null}
                <div className="quote-ledger-row is-total">
                  <dt>Total Payable</dt>
                  <dd id="quoteTotalPayableValue">
                    {quote.pricingBreakdown.formattedTotalPayableInr}
                  </dd>
                </div>
              </dl>

              <p className="quote-signature-note">
                <code>{quote.quoteId}</code> · {quote.tamperProtectionNotice}
              </p>

              <div className="cart-config-block" style={{ marginTop: '12px' }}>
                <label htmlFor="orderInstructionsInput" className="cart-config-label">
                  Cooking or Rider Instructions (Optional)
                </label>
                <input
                  id="orderInstructionsInput"
                  type="text"
                  className="cart-coupon-input"
                  maxLength={240}
                  placeholder="e.g. Ring bell once, keep mustard sauce separate"
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                />
              </div>
            </section>
          ) : null}

          {orderError ? (
            <div className="cart-banner-error" role="alert">
              {orderError}
            </div>
          ) : null}

          <div className="cart-footer-actions">
            {quote && !quoteExpired && !quote.priceDriftDetected ? (
              <button
                type="button"
                id="placeOrderBtn"
                className="btn btn-primary"
                disabled={placingOrder || quoteLoading}
                onClick={() => onPlaceOrder(specialInstructions)}
              >
                {placingOrder
                  ? 'Placing Idempotent Order…'
                  : `Place Order & Pay (${quote.pricingBreakdown.formattedTotalPayableInr})`}
              </button>
            ) : null}
            <button
              type="button"
              id="refreshQuoteBtn"
              className={
                quote && !quoteExpired && !quote.priceDriftDetected
                  ? 'btn btn-outline'
                  : 'btn btn-primary'
              }
              disabled={quoteLoading || placingOrder}
              onClick={() => onGenerateQuote(false)}
            >
              {quoteLoading
                ? 'Computing Server Quote…'
                : quoteExpired
                  ? 'Regenerate 600s Quote'
                  : 'Refresh Authoritative Quote'}
            </button>
            {!isLiveServerMode ? (
              <button type="button" className="btn btn-outline" onClick={onOpenAuthModal}>
                Sign In for Server-Signed Quote
              </button>
            ) : null}
          </div>
        </div>
      )}
    </dialog>
  );
}
