import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';

const COMPARISONS = [
  {
    problem: 'Customers repeatedly ask for prices',
    solution: 'Transparent digital product pricing',
  },
  {
    problem: 'Physical catalogues are difficult to maintain',
    solution: 'Centrally managed digital catalogue',
  },
  {
    problem: 'Customers depend heavily on sales staff',
    solution: 'Self-service QR-powered browsing',
  },
  {
    problem: 'Product comparison is time-consuming',
    solution: 'Digital product comparison',
  },
  {
    problem: 'Manual stock tracking',
    solution: 'Centralized inventory management',
  },
  {
    problem: 'Lengthy product selection processes',
    solution: 'Smart search and category filters',
  },
  {
    problem: 'Disconnected billing and order processes',
    solution: 'Integrated order and checkout management',
  },
  {
    problem: 'Limited visibility into business operations',
    solution: 'Centralized owner dashboard',
  },
  {
    problem: 'Difficulty updating product information',
    solution: 'Dynamic catalogue management',
  },
  {
    problem: 'Inconsistent customer experience',
    solution: 'Standardized digital shopping journey',
  },
];

export function MarketingProblemsSolutions() {
  return (
    <section className="bg-[#45081C] py-24 text-[#FFF4E6] border-t border-[#C9A45C]/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#6A0D2A] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A45C]">
            <Sparkles className="h-3 w-3" />
            <span>OPERATIONAL REALITIES</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FFF4E6]">
            Built to Solve Real Retail Challenges.
          </h2>

          <p className="mt-4 text-sm sm:text-base text-[#FFF4E6]/80 leading-relaxed">
            Every retail business faces operational challenges. ZENTRO BuildMart is designed to simplify everyday processes and create a better experience for customers and business owners.
          </p>
        </div>

        {/* Professional Table / Card Matrix */}
        <div className="mt-14 overflow-hidden rounded-2xl border border-[#C9A45C]/25 bg-[#6A0D2A]/30 shadow-2xl backdrop-blur-sm">
          
          {/* Table Header */}
          <div className="grid grid-cols-1 md:grid-cols-2 border-b border-[#C9A45C]/20 bg-[#45081C]/90 text-xs font-bold uppercase tracking-wider">
            <div className="flex items-center gap-2 px-6 py-4 text-red-300">
              <AlertCircle className="h-4 w-4" />
              <span>Traditional Retail Challenges</span>
            </div>
            <div className="flex items-center gap-2 px-6 py-4 text-[#C9A45C] border-t md:border-t-0 md:border-l border-[#C9A45C]/20 bg-[#6A0D2A]/50">
              <CheckCircle2 className="h-4 w-4" />
              <span>ZENTRO BuildMart Solutions</span>
            </div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-[#C9A45C]/15">
            {COMPARISONS.map((row, idx) => (
              <div
                key={row.problem}
                className={`grid grid-cols-1 md:grid-cols-2 text-sm transition-colors hover:bg-[#6A0D2A]/40 ${
                  idx % 2 === 0 ? 'bg-[#45081C]/40' : 'bg-transparent'
                }`}
              >
                {/* Traditional Side */}
                <div className="flex items-center gap-3 px-6 py-4 text-[#FFF4E6]/75">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-950/80 text-red-400 text-xs font-bold">
                    ✕
                  </span>
                  <span>{row.problem}</span>
                </div>

                {/* BuildMart Solution Side */}
                <div className="flex items-center gap-3 px-6 py-4 font-medium text-[#FFF4E6] md:border-l border-[#C9A45C]/15 bg-[#6A0D2A]/20">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[#C9A45C]" />
                  <span>{row.solution}</span>
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Closing Quote Banner */}
        <div className="mt-12 text-center">
          <p className="font-display text-lg sm:text-xl font-bold italic text-[#C9A45C]">
            &ldquo;Spend less time managing repetitive tasks and more time growing your business.&rdquo;
          </p>
        </div>

      </div>
    </section>
  );
}
