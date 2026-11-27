'use client';

import { useState } from 'react';
import { ChevronDown, Sparkles, HelpCircle } from 'lucide-react';

const FAQS = [
  {
    question: 'What is ZENTRO BuildMart?',
    answer:
      'ZENTRO BuildMart is a digital retail management platform designed by ZENTRO Networks for construction material showrooms, tile retailers, sanitaryware stores and home improvement businesses.',
  },
  {
    question: 'How does QR-based shopping work?',
    answer:
      'Customers scan the shop’s unique QR code using their smartphone and access its digital storefront. They can explore available products and complete supported shopping activities directly through their browser.',
  },
  {
    question: 'Do customers need to install an application?',
    answer:
      'No. Customers can access the digital storefront through a supported mobile web browser without downloading any mobile app.',
  },
  {
    question: 'Can every shop have its own catalogue?',
    answer:
      'Yes. Each configured shop can have its own storefront, product catalogue, pricing, inventory and available features.',
  },
  {
    question: 'Can business owners manage their own products?',
    answer:
      'Yes. Authorized store owners can manage their product information, categories, images, pricing, stock and other supported operations through their dedicated dashboard.',
  },
  {
    question: 'Can customers pay using cash?',
    answer:
      'Yes, where cash payments are enabled. The store owner can confirm payment after receiving the amount from the customer.',
  },
  {
    question: 'Does BuildMart support online payments?',
    answer:
      'Online payment availability depends on the store’s payment configuration and enabled features. Only configured and operational payment options are displayed to customers.',
  },
  {
    question: 'Can features be customized for individual businesses?',
    answer:
      'Yes. Authorized platform administrators can configure optional features for individual shops, subject to applicable subscription and system restrictions.',
  },
  {
    question: 'Can BuildMart support multiple showrooms?',
    answer:
      'The platform is designed to support independent storefronts within a scalable multi-store architecture.',
  },
  {
    question: 'Will BuildMart replace my existing physical showroom?',
    answer:
      'No. BuildMart is designed to complement physical showrooms by connecting them with digital shopping and business management tools.',
  },
  {
    question: 'How can I get BuildMart for my business?',
    answer:
      'Contact ZENTRO Networks or submit a business demo request below to discuss your requirements.',
  },
];

export function MarketingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section id="faq" className="bg-[#45081C] py-24 text-[#FFF4E6] border-t border-[#C9A45C]/20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#6A0D2A] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A45C]">
            <Sparkles className="h-3 w-3" />
            <span>FREQUENTLY ASKED QUESTIONS</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FFF4E6]">
            Questions & Answers.
          </h2>

          <p className="mt-4 text-sm sm:text-base text-[#FFF4E6]/80 leading-relaxed">
            Everything you need to know about ZENTRO BuildMart and our QR-powered showroom platform.
          </p>
        </div>

        {/* 11 Accordion Items */}
        <div className="mt-14 space-y-3.5">
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={faq.question}
                className="overflow-hidden rounded-xl border border-[#C9A45C]/25 bg-[#6A0D2A]/30 transition-all hover:border-[#C9A45C]/50"
              >
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left text-sm sm:text-base font-semibold text-[#FFF4E6]"
                  aria-expanded={isOpen}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[#C9A45C]">
                      {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                    </span>
                    <span>{faq.question}</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[#C9A45C] transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-[#FFF4E6]/80 leading-relaxed border-t border-[#C9A45C]/15 animate-in fade-in">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
