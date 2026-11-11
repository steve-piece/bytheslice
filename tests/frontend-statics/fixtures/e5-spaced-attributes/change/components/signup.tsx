// components/signup.tsx
// Fixture: JSX allows whitespace around = in htmlFor and id; the unlabeled field still reports.
export function Signup() {
  return (
    <form>
      <label htmlFor = "email">Email</label>
      <input id = "email" type="email" />
      <input type="text" />
    </form>
  );
}
