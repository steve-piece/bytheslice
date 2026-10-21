// components/profile-card.tsx
// Fixture: a component that uses only catalog tokens, scale motion and labelled controls.
export function ProfileCard(props: { avatar: string }) {
  return (
    <div className="bg-[var(--primary)] text-foreground bg-background/80 hover:text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.4,_0,_0.2,_1)] border-2 text-sm shadow-md ring-offset-2">
      <img src={props.avatar} alt="Avatar" />
      <img src="/divider.svg" alt="" />
      <label htmlFor="name">Name</label>
      <input id="name" type="text" />
      <label>
        Email <input type="email" />
      </label>
      <input type="hidden" name="token" />
      <input {...props} />
      <textarea
        aria-labelledby="bio-label"
      />
    </div>
  );
}
