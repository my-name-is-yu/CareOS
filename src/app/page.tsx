export default function HomePage() {
  return (
    <main className="shell">
      <section className="card">
        <p className="eyebrow">CareOS foundation</p>
        <h1>Single-process Next.js scaffold</h1>
        <p className="lede">
          This app is ready for later lanes to wire in JSON-backed workflow
          logic, OpenAI Agents, and local API routes.
        </p>
        <ul className="list">
          <li>App Router on localhost:3000</li>
          <li>TypeScript, linting, and tests configured</li>
          <li>JSON seed data and fixture caches on disk</li>
        </ul>
      </section>
    </main>
  );
}
