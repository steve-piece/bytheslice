// components/card.tsx
// Fixture: utilities bound by the v3 config pass; one with no binding and one var() still report E1.
export function Card() {
  return <div className="bg-brand-500 text-brand border-accent-soft">ok</div>;
}
export function Bad() {
  return <div className="bg-fake" style={{ color: "var(--brand-500)" }}>no</div>;
}
