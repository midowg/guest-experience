import type { Metadata } from 'next';
import { getHomeStyle } from '@/lib/server/admin-settings';
import { EmptyHome } from './EmptyHome';

export const metadata: Metadata = {
  title: 'Werkudara Journey',
  openGraph: { title: 'Werkudara Journey', description: 'Setiap pertemuan, dimulai dengan sambutan.', type: 'website', siteName: 'Werkudara Journey' },
  robots: { index: false, follow: false },
};

// The look is read at most once a minute, and at once after the super admin changes it (revalidatePath).
export const revalidate = 60;

/**
 * journey.werkudara.group: the team's apps in the look picked in Super admin → Halaman utama. It
 * features and reveals no event; guests come in through the link they were given.
 */
export default async function Home() {
  const { style } = await getHomeStyle();
  return <EmptyHome style={style} />;
}
