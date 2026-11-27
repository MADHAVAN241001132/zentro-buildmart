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
import { MarketingEnquiryForm } from '@/components/marketing/enquiry-form';
import { MarketingFooter } from '@/components/marketing/footer';

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

export default function PlatformHome() {
  return (
    <div className="min-h-screen bg-[#FFF4E6] text-[#3B2529] selection:bg-[#C9A45C] selection:text-[#45081C]">
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
        <MarketingPricingSolutions />

        {/* SECTION 17: Frequently Asked Questions */}
        <MarketingFaq />

        {/* SECTION 18: Final Call to Action */}
        <MarketingFinalCta />

        {/* SECTION 19: Contact and Business Enquiry */}
        <MarketingEnquiryForm />
      </main>

      {/* SECTION 20: Premium Footer */}
      <MarketingFooter />
    </div>
  );
}
