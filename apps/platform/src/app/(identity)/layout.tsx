export default function IdentityLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main id="main-content" className="identity-shell">
      <div className="identity-art" aria-hidden="true">
        <span>J</span>
      </div>
      <section className="identity-panel">{children}</section>
    </main>
  );
}
