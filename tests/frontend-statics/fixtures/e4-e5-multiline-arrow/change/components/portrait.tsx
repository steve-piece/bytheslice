// components/portrait.tsx
// Fixture: multi-line tags whose arrow props (=>) and quoted > come before alt or aria-label.
export function Portrait() {
  return (
    <div>
      <img
        src="/u.png"
        onError={(event) => { event.currentTarget.hidden = true }}
        alt="User portrait"
      />
      <input
        onChange={(e) => console.log(e.target.value)}
        title="a > b"
        aria-label="Search"
      />
      <img
        src="/banner.png"
        onLoad={() => {}}
      />
    </div>
  );
}
