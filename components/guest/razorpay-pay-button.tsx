'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: () => void) => void };
  }
}

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment window'));
    document.body.appendChild(script);
  });
}

interface Props {
  keyId: string;
  providerOrderId: string;
  amountPaise: number;
  orderNumber: string;
  customerName: string;
  customerMobile: string;
}

/**
 * Opens Razorpay Checkout. The payment is confirmed only by the server: the handler posts the
 * signed response to /api/payments/razorpay/verify, and the webhook also settles the payment.
 * The browser never marks an order as paid by itself.
 */
export function RazorpayPayButton(props: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pay() {
    setError(null);
    setBusy(true);
    try {
      await loadScript();
      const Checkout = window.Razorpay;
      if (!Checkout) throw new Error('Payment window unavailable');
      const instance = new Checkout({
        key: props.keyId,
        amount: props.amountPaise,
        currency: 'INR',
        name: 'ZENTRO BuildMart',
        description: `Order ${props.orderNumber}`,
        order_id: props.providerOrderId,
        prefill: { name: props.customerName, contact: props.customerMobile },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const res = await fetch('/api/payments/razorpay/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response),
          });
          if (!res.ok) setError('We could not verify the payment yet. It will update automatically.');
          router.refresh();
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      instance.on('payment.failed', () => {
        setError('The payment did not go through. You can try again.');
        setBusy(false);
      });
      instance.open();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Payment could not start');
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button type="button" onClick={pay} disabled={busy} className="w-full py-3.5">
        {busy ? 'Opening payment…' : 'Pay now'}
      </Button>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
