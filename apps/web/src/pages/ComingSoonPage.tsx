import { Button, Eyebrow } from "@call-agent/ui";

export default function ComingSoonPage({ title }: { title: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 32,
        background: "#f0eee9",
        fontFamily: "var(--font-body)",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <Eyebrow>Coming soon</Eyebrow>
        <h1
          style={{
            margin: "0 0 12px",
            fontFamily: "var(--font-display)",
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h1>
        <p style={{ margin: "0 0 28px", color: "var(--text-muted)", lineHeight: 1.6 }}>
          This page is not built yet. The marketing landing is ready — more product
          surfaces come next.
        </p>
        <Button as="a" href="/" variant="cta" showArrow shine>
          Back to home
        </Button>
      </div>
    </div>
  );
}
