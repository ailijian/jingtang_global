export default function FoundationPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "96px 24px" }}>
      <p style={{ letterSpacing: "0.18em", fontWeight: 600 }}>JINGTANG</p>
      <h1
        style={{
          fontFamily: "Newsreader, Georgia, serif",
          fontSize: "clamp(2.5rem, 7vw, 4rem)",
          fontWeight: 400,
        }}
      >
        Website foundation
      </h1>
      <p style={{ color: "var(--jt-ink-soft)", fontSize: "1.1rem", lineHeight: 1.7 }}>
        This deployable exists for D2 build and environment verification. Public product, legal, and
        integration surfaces remain unavailable until D3 acceptance.
      </p>
    </main>
  );
}
