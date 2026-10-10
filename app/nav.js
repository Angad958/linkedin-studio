'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [['/', 'Queue'], ['/history', 'Posted'], ['/topics', 'Topics'], ['/outreach', 'Outreach'], ['/settings', 'Settings']];

export default function Nav() {
  const p = usePathname();
  return (
    <nav>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={(href === '/' ? p === '/' || p.startsWith('/draft') : p.startsWith(href)) ? 'on' : ''}>{label}</Link>
      ))}
    </nav>
  );
}
