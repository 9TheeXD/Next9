import { redirect } from 'next/navigation';

// The redesigned page that lived here is now at /; old links keep working.
export default async function Page({ searchParams }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) [].concat(v).forEach((x) => x !== undefined && sp.append(k, x));
  const q = sp.toString();
  redirect('/' + (q ? '?' + q : ''));
}
