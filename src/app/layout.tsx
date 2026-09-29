export const metadata = { title: 'Nabohjelp Pro', description: 'Nabohjelp i Oslo og Norge' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
