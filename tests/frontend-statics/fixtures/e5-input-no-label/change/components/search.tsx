// components/search.tsx
// Fixture: one unlabelled input, one with aria-label.
export function Search() {
  return (
    <form>
      <input type="text" />
      <input type="text" aria-label="Search" />
    </form>
  );
}
