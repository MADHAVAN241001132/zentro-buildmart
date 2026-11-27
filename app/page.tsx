import type { Metadata } from 'next';
import { MarketingNavbar } from '@/components/marketing/navbar';
import { MarketingHero } from '@/components/marketing/hero';
import { MarketingValueStrip } from '@/components/marketing/value-strip';
import { MarketingAbout } from '@/components/marketing/about';
import { MarketingProblemsSolutions } from '@/components/marketing/problems-solutions';
import { MarketingHowItWorks } from '@/components/marketing/how-it-works';
import { MarketingThreeExperiences } from '@/components/marketing/three-experiences';
import { MarketingFeaturesShowcase } from '@/components/marketing/features-showcase';
import { MarketingQrDemo } from '@/components/marketing/qr-demo';
import { MarketingIndustries } from '@/components/marketing/industries';
import { MarketingOwnerBenefits } from '@/components/marketing/owner-benefits';
import { MarketingCustomerBenefits } from '@/components/marketing/customer-benefits';
import { MarketingWhyBuildMart } from '@/components/marketing/why-buildmart';
import { MarketingBrandSection } from '@/components/marketing/brand-section';
import { MarketingOnboarding } from '@/components/marketing/onboarding';
import { MarketingPricingSolutions } from '@/components/marketing/pricing-solutions';
import { MarketingFaq } from '@/components/marketing/faq';
import { MarketingFinalCta } from '@/components/marketing/final-cta';
import { MarketingContactSection } from '@/components/marketing/contact-section';
import { MarketingEnquiryForm } from '@/components/marketing/enquiry-form';
import { MarketingFooter } from '@/components/marketing/footer';
import { Phone } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PublicSubscriptionPlan } from '@/components/marketing/pricing-solutions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ZENTRO BuildMart | Smart QR Retail & Digital Showroom Platform by ZENTRO Networks',
  description:
    'Transform your construction material showroom with ZENTRO BuildMart, a QR-powered digital retail platform by ZENTRO Networks. Explore smart catalogues, inventory management, order management and connected shopping experiences.',
  openGraph: {
    title: 'ZENTRO BuildMart | Smart QR Retail & Digital Showroom Platform',
    description:
      'Transform your construction material showroom with ZENTRO BuildMart, a QR-powered digital retail platform by ZENTRO Networks.',
    type: 'website',
    images: ['/images/showroom-hero.webp'],
  },
};

export default async function PlatformHome() {
  let activePlans: PublicSubscriptionPlan[] = [];
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('subscription_plans')
      .select('id, code, name, description, billing_interval, price_paise, max_products, products_unlimited, max_users, users_unlimited, features')
      .eq('is_active', true)
      .order('price_paise', { ascending: true });
    activePlans = (data ?? []) as PublicSubscriptionPlan[];
  } catch {
    activePlans = [];
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-[#FFF4E6] text-[#3B2529] selection:bg-[#C9A45C] selection:text-[#45081C]">
      {/* SECTION 1: Premium Navigation Bar */}
      <MarketingNavbar />

      {/* Main Content Area */}
      <main>
        {/* SECTION 2: Hero Section */}
        <MarketingHero />

        {/* SECTION 3: Product Value Strip */}
        <MarketingValueStrip />

        {/* SECTION 4: About ZENTRO BuildMart */}
        <MarketingAbout />

        {/* SECTION 5: Business Problems and Solutions */}
        <MarketingProblemsSolutions />

        {/* SECTION 6: How ZENTRO BuildMart Works */}
        <MarketingHowItWorks />

        {/* SECTION 7: Three Connected Experiences */}
        <MarketingThreeExperiences />

        {/* SECTION 8: Product Features Showcase */}
        <MarketingFeaturesShowcase />

        {/* SECTION 9: Interactive QR Shopping Demonstration */}
        <MarketingQrDemo />

        {/* SECTION 10: Industries We Serve */}
        <MarketingIndustries />

        {/* SECTION 11: Benefits for Business Owners */}
        <MarketingOwnerBenefits />

        {/* SECTION 12: Benefits for Customers */}
        <MarketingCustomerBenefits />

        {/* SECTION 13: Why Choose ZENTRO BuildMart? */}
        <MarketingWhyBuildMart />

        {/* SECTION 14: ZENTRO Networks Brand Section */}
        <MarketingBrandSection />

        {/* SECTION 15: Business Onboarding */}
        <MarketingOnboarding />

        {/* SECTION 16: Packages and Custom Business Solutions */}
        <MarketingPricingSolutions plans={activePlans} />

        {/* SECTION 17: Frequently Asked Questions */}
        <MarketingFaq />

        {/* SECTION 18: Final Call to Action */}
        <MarketingFinalCta />

        {/* SECTION 19: Direct Contact Us */}
        <MarketingContactSection />

        {/* SECTION 20: Business Demo Enquiry */}
        <MarketingEnquiryForm plans={activePlans} />
      </main>

      {/* Floating Direct Call CTA */}
      <a
        href="tel:+916381337271"
        aria-label="Call ZENTRO Networks at +91 63813 37271"
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-[#C9A45C] bg-[#6A0D2A] px-4 py-3 text-xs font-bold text-[#FFF4E6] shadow-xl transition hover:scale-105 hover:bg-[#45081C]"
      >
        <Phone className="h-4 w-4 text-[#C9A45C]" />
        <span className="hidden sm:inline">+91 63813 37271</span>
      </a>

      {/* SECTION 21: Premium Footer */}
      <MarketingFooter />
    </div>
  );
}
