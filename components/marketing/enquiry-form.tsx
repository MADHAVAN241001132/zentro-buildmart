'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import {
  submitBusinessEnquiryAction,
  type EnquiryFormState,
} from '@/app/actions/enquiry';
import type { PublicSubscriptionPlan } from '@/components/marketing/pricing-solutions';
import { formatINR } from '@/lib/money';
import {
  Sparkles,
  Send,
  CheckCircle2,
  AlertCircle,
  Building2,
  Mail,
  Phone,
  MapPin,
  Clock,
  ShieldCheck,
} from 'lucide-react';

const INITIAL_STATE: EnquiryFormState = {
  ok: false,
};

const BUSINESS_TYPES = [
  'Tiles & Flooring Showroom',
  'Sanitaryware & Bathware Showroom',
  'Steel Door & Security Door Dealer',
  'Plumbing, Faucets & Shower Fittings',
  'Bathroom Accessories & Mirrors',
  'Kitchen Sinks & Modular Fittings',
  'Construction Materials & Adhesives',
  'Multi-Category Home Improvement Center',
  'Other Construction & Building Retail',
];

const STORE_COUNTS = [
  '1 Showroom / Store',
  '2 to 5 Showrooms',
  '6 to 10 Showrooms',
  'More than 10 Showrooms',
];

const FEATURES_LIST = [
  'Smart QR In-Store Shopping',
  'Digital Product Catalogue',
  'POS Billing & Held Bills',
  'Centralized Inventory Tracking',
  'Formal Customer Quotations',
  'Tile Area & Cost Calculator',
  'Interactive Room Visualizer',
  'Multi-Store Network Architecture',
];

export function MarketingEnquiryForm({ plans = [] }: { plans?: PublicSubscriptionPlan[] }) {
  const [state, formAction, isPending] = useActionState(
    submitBusinessEnquiryAction,
    INITIAL_STATE
  );

  const [selectedPlanId, setSelectedPlanId] = useState('');
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('plan');
    if (p && plans.some((pl) => pl.id === p)) {
      setSelectedPlanId(p);
    }
  }, [plans]);

  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([
    'Smart QR In-Store Shopping',
    'Digital Product Catalogue',
  ]);

  const toggleFeature = (feat: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(feat) ? prev.filter((f) => f !== feat) : [...prev, feat]
    );
  };

  return (
    <section id="contact" className="bg-[#FFF4E6] py-24 text-[#3B2529]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#FFF4E6] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6A0D2A]">
            <Sparkles className="h-3 w-3 text-[#C9A45C]" />
            <span>BUSINESS CONSULTATION</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#6A0D2A]">
            Let&apos;s Build Your Digital Showroom.
          </h2>

          <p className="mt-4 text-sm sm:text-base text-[#806C65] leading-relaxed">
            Tell us about your business, and let&apos;s explore how ZENTRO BuildMart can support your retail operations and customer experience.
          </p>
        </div>

        {/* Form and Contact Info Grid */}
        <div className="mt-16 grid gap-12 lg:grid-cols-12 lg:items-start">
          
          {/* Left Column: Contact Cards */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            <div className="rounded-2xl border border-[#E6D5C3] bg-[#FFFAF4] p-8 shadow-sm">
              <h3 className="font-display text-xl font-bold text-[#6A0D2A]">
                ZENTRO Networks Retail Solutions
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-[#806C65] leading-relaxed">
                Our technology team works directly with showroom owners to configure tailor-made digital storefronts, category structures, and staff workflows.
              </p>

              <div className="mt-8 space-y-5 border-t border-[#E6D5C3]/60 pt-6">
                
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6A0D2A] text-[#C9A45C] shadow-sm">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#6A0D2A]">Corporate Developer</div>
                    <div className="text-xs text-[#3B2529] font-medium mt-0.5">ZENTRO Networks Enterprise Solutions</div>
                    <div className="text-[11px] text-[#806C65]">Software Products Division</div>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6A0D2A] text-[#C9A45C] shadow-sm">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#6A0D2A]">Privacy & Confidentiality</div>
                    <div className="text-xs text-[#3B2529] font-medium mt-0.5">Strict Role-Based Data Isolation</div>
                    <div className="text-[11px] text-[#806C65]">Your enquiry is accessible only to authorized administrators.</div>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6A0D2A] text-[#C9A45C] shadow-sm">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#6A0D2A]">Response Commitment</div>
                    <div className="text-xs text-[#3B2529] font-medium mt-0.5">Within 24 Business Hours</div>
                    <div className="text-[11px] text-[#806C65]">A personalized consultation with our showroom architects.</div>
                  </div>
                </div>

              </div>
            </div>

            {/* Live Store Pill */}
            <div className="rounded-2xl border border-[#C9A45C]/40 bg-[#6A0D2A] p-6 text-[#FFF4E6] shadow-md">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#C9A45C]">
                Ready to see it immediately?
              </span>
              <h4 className="font-display text-lg font-bold text-[#FFF4E6] mt-1">
                Explore the Active Demo Showroom
              </h4>
              <p className="mt-1 text-xs text-[#FFF4E6]/80">
                You can immediately browse 80+ real products, add them to your cart, test the tile calculator, and try compare features right in your browser.
              </p>
              <Link
                href="/store/zentro-buildmart-showroom"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#C9A45C] hover:underline"
              >
                <span>Launch Interactive Showroom →</span>
              </Link>
            </div>

          </div>

          {/* Right Column: Functional Enquiry Form */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-[#E6D5C3] bg-[#FFFAF4] p-8 sm:p-10 shadow-md">
              
              <h3 className="font-display text-2xl font-bold text-[#6A0D2A]">
                Request a Business Demo
              </h3>
              <p className="mt-1 text-xs text-[#806C65]">
                Fill out the form below to receive a customized walkthrough for your showroom.
              </p>

              {/* Status Alerts */}
              {state.ok && (
                <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-400 bg-emerald-50 p-4 text-emerald-950">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-emerald-900">Enquiry Received Successfully</p>
                    <p className="text-xs text-emerald-800 mt-0.5">{state.message}</p>
                    {state.ticketId && (
                      <p className="text-[10px] font-mono text-emerald-700 mt-1">
                        Reference Ticket: #{state.ticketId.slice(0, 8)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {!state.ok && state.message && (
                <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-950">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-900">Submission Error</p>
                    <p className="text-xs text-red-800 mt-0.5">{state.message}</p>
                  </div>
                </div>
              )}

              {/* The Form */}
              <form action={formAction} className="mt-8 space-y-6">
                
                {/* 2-column: Name & Business Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="fullName" className="block text-xs font-bold uppercase tracking-wider text-[#6A0D2A]">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="fullName"
                      name="fullName"
                      required
                      placeholder="e.g. Ramesh Kumar"
                      className="mt-1.5 w-full rounded-xl border border-[#E6D5C3] bg-white px-3.5 py-2.5 text-xs text-[#3B2529] placeholder:text-stone-400 focus:border-[#6A0D2A] focus:ring-1 focus:ring-[#6A0D2A] outline-none"
                    />
                    {state.errors?.fullName && (
                      <p className="mt-1 text-[11px] text-red-600">{state.errors.fullName[0]}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="businessName" className="block text-xs font-bold uppercase tracking-wider text-[#6A0D2A]">
                      Business or Showroom Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="businessName"
                      name="businessName"
                      required
                      placeholder="e.g. Royal Ceramics & Bathworld"
                      className="mt-1.5 w-full rounded-xl border border-[#E6D5C3] bg-white px-3.5 py-2.5 text-xs text-[#3B2529] placeholder:text-stone-400 focus:border-[#6A0D2A] focus:ring-1 focus:ring-[#6A0D2A] outline-none"
                    />
                    {state.errors?.businessName && (
                      <p className="mt-1 text-[11px] text-red-600">{state.errors.businessName[0]}</p>
                    )}
                  </div>
                </div>

                {/* 2-column: Business Type & Store Count */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="businessType" className="block text-xs font-bold uppercase tracking-wider text-[#6A0D2A]">
                      Business Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="businessType"
                      name="businessType"
                      required
                      defaultValue=""
                      className="mt-1.5 w-full rounded-xl border border-[#E6D5C3] bg-white px-3.5 py-2.5 text-xs text-[#3B2529] focus:border-[#6A0D2A] focus:ring-1 focus:ring-[#6A0D2A] outline-none"
                    >
                      <option value="" disabled>Select business type...</option>
                      {BUSINESS_TYPES.map((bt) => (
                        <option key={bt} value={bt}>{bt}</option>
                      ))}
                    </select>
                    {state.errors?.businessType && (
                      <p className="mt-1 text-[11px] text-red-600">{state.errors.businessType[0]}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="storeCount" className="block text-xs font-bold uppercase tracking-wider text-[#6A0D2A]">
                      Number of Stores <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="storeCount"
                      name="storeCount"
                      required
                      defaultValue="1 Showroom / Store"
                      className="mt-1.5 w-full rounded-xl border border-[#E6D5C3] bg-white px-3.5 py-2.5 text-xs text-[#3B2529] focus:border-[#6A0D2A] focus:ring-1 focus:ring-[#6A0D2A] outline-none"
                    >
                      {STORE_COUNTS.map((sc) => (
                        <option key={sc} value={sc}>{sc}</option>
                      ))}
                    </select>
                    {state.errors?.storeCount && (
                      <p className="mt-1 text-[11px] text-red-600">{state.errors.storeCount[0]}</p>
                    )}
                  </div>
                </div>

                {/* 2-column: Mobile & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="mobile" className="block text-xs font-bold uppercase tracking-wider text-[#6A0D2A]">
                      Mobile Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      id="mobile"
                      name="mobile"
                      required
                      placeholder="e.g. +91 98765 43210"
                      className="mt-1.5 w-full rounded-xl border border-[#E6D5C3] bg-white px-3.5 py-2.5 text-xs text-[#3B2529] placeholder:text-stone-400 focus:border-[#6A0D2A] focus:ring-1 focus:ring-[#6A0D2A] outline-none"
                    />
                    {state.errors?.mobile && (
                      <p className="mt-1 text-[11px] text-red-600">{state.errors.mobile[0]}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-[#6A0D2A]">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      placeholder="e.g. showroom@business.com"
                      className="mt-1.5 w-full rounded-xl border border-[#E6D5C3] bg-white px-3.5 py-2.5 text-xs text-[#3B2529] placeholder:text-stone-400 focus:border-[#6A0D2A] focus:ring-1 focus:ring-[#6A0D2A] outline-none"
                    />
                    {state.errors?.email && (
                      <p className="mt-1 text-[11px] text-red-600">{state.errors.email[0]}</p>
                    )}
                  </div>
                </div>

                {/* City & Selected Plan */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="city" className="block text-xs font-bold uppercase tracking-wider text-[#6A0D2A]">
                      City or Location <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                    id="city"
                    name="city"
                    required
                    placeholder="e.g. Coimbatore, Tamil Nadu"
                    className="mt-1.5 w-full rounded-xl border border-[#E6D5C3] bg-white px-3.5 py-2.5 text-xs text-[#3B2529] placeholder:text-stone-400 focus:border-[#6A0D2A] focus:ring-1 focus:ring-[#6A0D2A] outline-none"
                  />
                  {state.errors?.city && (
                    <p className="mt-1 text-[11px] text-red-600">{state.errors.city[0]}</p>
                  )}
                </div>

                  <div>
                    <label htmlFor="selectedPlanId" className="block text-xs font-bold uppercase tracking-wider text-[#6A0D2A]">
                      Interested Subscription Plan
                    </label>
                    <select
                      id="selectedPlanId"
                      name="selectedPlanId"
                      value={selectedPlanId}
                      onChange={(e) => setSelectedPlanId(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[#E6D5C3] bg-white px-3.5 py-2.5 text-xs text-[#3B2529] focus:border-[#6A0D2A] focus:ring-1 focus:ring-[#6A0D2A] outline-none"
                    >
                      <option value="">Undecided / Custom Consultation</option>
                      {plans.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.name} ({formatINR(pl.price_paise)} / {pl.billing_interval === 'annual' ? 'year' : 'month'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Interested Features (Checkboxes) */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#6A0D2A] mb-2">
                    Interested Features & Modules
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {FEATURES_LIST.map((feat) => {
                      const isSelected = selectedFeatures.includes(feat);
                      return (
                        <label
                          key={feat}
                          onClick={() => toggleFeature(feat)}
                          className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-xs cursor-pointer select-none transition-colors ${
                            isSelected
                              ? 'border-[#C9A45C] bg-[#FFF4E6] text-[#6A0D2A] font-semibold'
                              : 'border-[#E6D5C3] bg-white text-[#3B2529] hover:bg-stone-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            name="interestedFeatures"
                            value={feat}
                            checked={isSelected}
                            readOnly
                            className="h-3.5 w-3.5 rounded text-[#6A0D2A] focus:ring-[#6A0D2A]"
                          />
                          <span>{feat}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Requirements / Notes */}
                <div>
                  <label htmlFor="requirements" className="block text-xs font-bold uppercase tracking-wider text-[#6A0D2A]">
                    Business Requirements & Current Operations
                  </label>
                  <textarea
                    id="requirements"
                    name="requirements"
                    rows={3}
                    placeholder="Describe your showroom size, current inventory challenges, or specific customization goals..."
                    className="mt-1.5 w-full rounded-xl border border-[#E6D5C3] bg-white p-3 text-xs text-[#3B2529] placeholder:text-stone-400 focus:border-[#6A0D2A] focus:ring-1 focus:ring-[#6A0D2A] outline-none"
                  />
                </div>

                {/* Consent */}
                <div className="flex items-start gap-2.5 pt-2">
                  <input
                    type="checkbox"
                    id="consent"
                    name="consent"
                    required
                    defaultChecked
                    className="mt-0.5 h-4 w-4 rounded text-[#6A0D2A] focus:ring-[#6A0D2A]"
                  />
                  <label htmlFor="consent" className="text-xs text-[#806C65] leading-relaxed cursor-pointer">
                    I consent to being contacted by the ZENTRO Networks team via phone, WhatsApp, or email regarding this business demo enquiry.
                  </label>
                </div>
                {state.errors?.consent && (
                  <p className="text-[11px] text-red-600">{state.errors.consent[0]}</p>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6A0D2A] via-[#851638] to-[#6A0D2A] py-3.5 text-xs sm:text-sm font-bold text-[#FFF4E6] shadow-xl hover:brightness-110 active:scale-98 transition-all disabled:opacity-60"
                >
                  {isPending ? (
                    <span>Submitting Enquiry...</span>
                  ) : (
                    <>
                      <span>Request a Business Demo</span>
                      <Send className="h-4 w-4 text-[#C9A45C]" />
                    </>
                  )}
                </button>

              </form>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
