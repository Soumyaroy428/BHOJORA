const PILLARS = [
  {
    icon: '🛵',
    title: '1. Food Delivery',
    description:
      'Geospatial Kolkata dispatch engine, authoritative server price quotes in integer paise, live map tracking, and secure 4-digit Delivery OTP handovers.',
    iconBackground: 'var(--terracotta-light)',
    iconColor: 'var(--terracotta)',
  },
  {
    icon: '🛡️',
    title: '2. Trust Transparency',
    description:
      'Standardized on-site kitchen inspections, tamper-evident SHA-256 photo hashes, strict separation of inspector and reviewer duties, and instant critical violation suspensions.',
    iconBackground: 'var(--trust-green-light)',
    iconColor: 'var(--trust-green)',
  },
  {
    icon: '🤖',
    title: '3. Supervised AI',
    description:
      'Human-supervised computer vision flagging potential kitchen risk anomalies, demand prediction, and smart dish recommendations without automated score certification.',
    iconBackground: 'var(--saffron-light)',
    iconColor: '#B3740D',
  },
] as const;

export function PillarsSection() {
  return (
    <section id="pillars" className="container">
      <div className="pillars-section">
        <div style={{ textAlign: 'center', maxWidth: '680px', margin: '0 auto' }}>
          <h2 className="section-title">The Three Pillars of Bhojora</h2>
          <p className="section-desc">
            A unified food-tech ecosystem engineered for trust, convenience, and intelligence.
          </p>
        </div>

        <div className="pillars-grid">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="pillar-card">
              <div
                className="pillar-icon"
                aria-hidden="true"
                style={{ background: pillar.iconBackground, color: pillar.iconColor }}
              >
                {pillar.icon}
              </div>
              <h3 className="pillar-title">{pillar.title}</h3>
              <p className="pillar-text">{pillar.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
