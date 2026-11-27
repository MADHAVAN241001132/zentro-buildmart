import Image from 'next/image';

export function ZentroLogo({
  size = 40,
  className = '',
  alt = 'ZENTRO BuildMart',
}: {
  size?: number;
  className?: string;
  alt?: string;
}) {
  return (
    <Image
      src="/images/zentro-logo.png"
      alt={alt}
      width={size}
      height={size}
      className={`shrink-0 rounded-control object-contain ${className}`}
      priority
    />
  );
}
