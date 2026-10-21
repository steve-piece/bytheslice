// components/gallery.tsx
// Fixture: one image without alt, one declared decorative.
export function Gallery() {
  return (
    <div>
      <img src="/photo.png" />
      <img src="/flourish.svg" alt="" />
    </div>
  );
}
