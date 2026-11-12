import type { KeyboardEvent } from 'react';
import { KOLKATA_ZONE_OPTIONS } from '../data/kitchens';
import type { KolkataZoneId } from '../types/domain';

interface HeroSectionProps {
  searchQuery: string;
  selectedZone: KolkataZoneId;
  recentSearches: readonly string[];
  onSearchChange: (value: string) => void;
  onSubmitSearch: (queryOverride?: string) => void;
  onClearRecentSearches: () => void;
  onSelectZone: (zone: KolkataZoneId) => void;
}

export function HeroSection({
  searchQuery,
  selectedZone,
  recentSearches,
  onSearchChange,
  onSubmitSearch,
  onClearRecentSearches,
  onSelectZone,
}: HeroSectionProps) {
  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }
    event.preventDefault();
    onSubmitSearch();
  }

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

        <search>
          <form
            action="#discover"
            method="GET"
            className="search-container"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitSearch();
            }}
          >
            <span
              aria-hidden="true"
              style={{ fontSize: '18px', color: 'var(--neutral-400)', marginLeft: '6px' }}
            >
              🔍
            </span>
            <label htmlFor="foodSearch" className="visually-hidden">
              Search Kolkata restaurants, cuisines, or dishes
            </label>
            <input
              id="foodSearch"
              name="q"
              type="search"
              className="search-input"
              maxLength={80}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="search"
              placeholder="Search for Biryani, Paneer Tikka, Baked Rosogolla, Arsalan..."
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '8px 18px' }}>
              Find Food
            </button>
          </form>
        </search>

        {recentSearches.length > 0 ? (
          <div className="recent-searches-bar" aria-label="Recent searches">
            <span className="recent-searches-label">Recent:</span>
            {recentSearches.map((term) => (
              <button
                key={term}
                type="button"
                className="chip"
                onClick={() => {
                  onSearchChange(term);
                  onSubmitSearch(term);
                }}
              >
                {term}
              </button>
            ))}
            <button
              type="button"
              className="chip"
              onClick={onClearRecentSearches}
              aria-label="Clear recent searches"
            >
              Clear recent
            </button>
          </div>
        ) : null}

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
