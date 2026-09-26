interface PlaceholderPageProps {
  title: string;
  phase: string;
  description: string;
}

/** Route placeholder for screens delivered in later phases (08_PHASE_PLAN.md). */
export function PlaceholderPage({ title, phase, description }: PlaceholderPageProps) {
  return (
    <section className="page">
      <header className="page-header">
        <h1>{title}</h1>
        <span className="badge">Ships in {phase}</span>
      </header>
      <div className="card">
        <p>{description}</p>
        <p className="muted">
          This route is registered in the Phase 1 navigation shell; the screen is implemented in {phase} per
          docs/08_PHASE_PLAN.md.
        </p>
      </div>
    </section>
  );
}
