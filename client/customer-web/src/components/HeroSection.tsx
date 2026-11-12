import { KOLKATA_ZONE_OPTIONS } from '../data/kitchens';
import type { KolkataZoneId } from '../types/domain';

interface HeroSectionProps {
  searchQuery: string;
  selectedZone: KolkataZoneId;
  onSearchChange: (value: string) => void;
  onSelectZone: (zone: KolkataZoneId) => void;
}

export function HeroSection({
  searchQuery,
  selectedZone,
  onSearchChange,
  onSelectZone,
}: HeroSectionProps) {
  return (
    <section className="hero">
      <div className="container">
        <div className="hero-badge">
          <span aria-hidden="true">🛡️</span>
          <span>Independent Kitchen Verification • Launching in Kolkata</span>
        </div>
        <h1 className="hero-title">
          Food You Love.
          <br />
          <span className="highlight">Trust You Deserve.</span>
        </h1>
        <p className="hero-subtitle">
          India&apos;s first food-tech platform combining seamless on-demand delivery with
          evidence-backed kitchen hygiene audits. Know exactly how your food is prepared before you
          order.
        </p>

        <form
          className="search-container"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <span
            aria-hidden="true"
            style={{ fontSize: '18px', color: 'var(--neutral-400)', marginLeft: '6px' }}
          >
            🔍
          </span>
          <label htmlFor="foodSearch" className="visually-hidden">
            Search Kolkata restaurants or dishes
          </label>
          <input
            id="foodSearch"
            type="search"
            className="search-input"
            placeholder="Search for Arsalan Biryani, Mocambo Devilled Crab, Sweets..."
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '8px 18px' }}>
            Find Food
          </button>
        </form>

        <div className="landmark-chips" role="group" aria-label="Filter kitchens by Kolkata zone">
          {KOLKATA_ZONE_OPTIONS.map((zone) => {
            const active = selectedZone === zone.id;
            return (
              <button
                key={zone.id}
                type="button"
                className={active ? 'chip active' : 'chip'}
                data-zone={zone.id}
                aria-pressed={active}
                onClick={() => onSelectZone(zone.id)}
              >
                {zone.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
