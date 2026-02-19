/**
 * Login page has its own layout — no sidebar or topbar.
 */
export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
