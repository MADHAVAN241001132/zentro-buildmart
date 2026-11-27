import Link from 'next/link';
import { Phone, Mail, ArrowRight, Headphones } from 'lucide-react';

export function MarketingContactSection() {
  return (
    <section id="contact-us" className="border-t border-[#E6D5C3] bg-[#FFFAF4] py-20 text-[#3B2529]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#FFF4E6] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6A0D2A]">
            <Headphones className="h-3.5 w-3.5 text-[#C9A45C]" />
            <span>CONTACT US</span>
          </div>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-[#6A0D2A] sm:text-4xl">
            Speak Directly With ZENTRO Networks
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#806C65] sm:text-base">
            Have questions about onboarding your showroom, pricing, or custom integrations? Reach our team directly by phone or email.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <a
            href="tel:+916381337271"
            className="group flex flex-col justify-between rounded-2xl border border-[#E6D5C3] bg-[#FFF4E6] p-7 shadow-sm transition hover:border-[#C9A45C] hover:shadow-md"
          >
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#6A0D2A] text-[#C9A45C] shadow-sm">
                <Phone className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-xl font-bold text-[#6A0D2A]">Call Us</h3>
              <p className="mt-1 text-xs text-[#806C65]">Direct sales & showroom onboarding support</p>
              <p className="mt-4 text-lg font-bold tracking-tight text-[#3B2529] group-hover:text-[#6A0D2A]">
                +91 63813 37271
              </p>
            </div>
            <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-[#6A0D2A]">
              <span>Tap to call</span>
              <ArrowRight className="h-3.5 w-3.5 text-[#C9A45C] transition-transform group-hover:translate-x-1" />
            </span>
          </a>

          <a
            href="mailto:zentronetworks@gmail.com"
            className="group flex flex-col justify-between rounded-2xl border border-[#E6D5C3] bg-[#FFF4E6] p-7 shadow-sm transition hover:border-[#C9A45C] hover:shadow-md"
          >
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#6A0D2A] text-[#C9A45C] shadow-sm">
                <Mail className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-xl font-bold text-[#6A0D2A]">Email Us</h3>
              <p className="mt-1 text-xs text-[#806C65]">Product enquiries, partnerships & support</p>
              <p className="mt-4 break-all text-base font-bold text-[#3B2529] group-hover:text-[#6A0D2A] sm:text-lg">
                zentronetworks@gmail.com
              </p>
            </div>
            <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-[#6A0D2A]">
              <span>Send an email</span>
              <ArrowRight className="h-3.5 w-3.5 text-[#C9A45C] transition-transform group-hover:translate-x-1" />
            </span>
          </a>

          <div className="flex flex-col justify-between rounded-2xl border border-[#C9A45C]/40 bg-[#45081C] p-7 text-[#FFF4E6] shadow-md">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#C9A45C]">
                Guided Walkthrough
              </span>
              <h3 className="mt-3 font-display text-xl font-bold text-[#FFF4E6]">
                Schedule a Business Demo
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#FFF4E6]/80">
                Prefer a tailored walkthrough for your tiles, sanitaryware, or hardware showroom? Submit the demo form below and we will reach out within 24 business hours.
              </p>
            </div>
            <Link
              href="#contact"
              className="mt-6 inline-flex w-fit items-center gap-2 rounded-xl bg-gradient-to-r from-[#C9A45C] to-[#B38D46] px-5 py-2.5 text-xs font-bold text-[#45081C] shadow-md transition hover:brightness-110"
            >
              <span>Request a Demo</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
