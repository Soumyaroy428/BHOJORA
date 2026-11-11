import { useMemo, useState } from 'react';
import { AuthDialog } from './components/AuthDialog';
import { BengaliBanner } from './components/BengaliBanner';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { KitchenDiscovery } from './components/KitchenDiscovery';
import { PillarsSection } from './components/PillarsSection';
import { PilotInfoDialog } from './components/PilotInfoDialog';
import { TrustProfileDialog } from './components/TrustProfileDialog';
import { KOLKATA_ZONE_OPTIONS, VERIFIED_KOLKATA_KITCHENS } from './data/kitchens';
import type { AuthSessionState, KitchenOutlet, KolkataZoneId } from './types/domain';

export function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZone, setSelectedZone] = useState<KolkataZoneId>('all');
  const [minScoreOnly, setMinScoreOnly] = useState(true);
  const [vegOnly, setVegOnly] = useState(false);
  const [bannerInEnglish, setBannerInEnglish] = useState(false);

  const [selectedTrustKitchen, setSelectedTrustKitchen] = useState<KitchenOutlet | null>(null);
  const [pilotInfoOpen, setPilotInfoOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authSession, setAuthSession] = useState<AuthSessionState | null>(null);

  const selectedZoneLabel = useMemo(() => {
    return KOLKATA_ZONE_OPTIONS.find((item) => item.id === selectedZone)?.label ?? 'All Kolkata';
  }, [selectedZone]);

  const headerZoneLabel = selectedZone === 'all' ? 'Salt Lake, Sector V' : selectedZoneLabel;

  const filteredKitchens = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return VERIFIED_KOLKATA_KITCHENS.filter((kitchen) => {
      const matchZone = selectedZone === 'all' || kitchen.zones.includes(selectedZone);
      const matchScore = !minScoreOnly || kitchen.score >= 90;
      const matchVeg = !vegOnly || kitchen.isPureVeg;
      const matchQuery = !normalizedQuery || kitchen.searchText.includes(normalizedQuery);
      return matchZone && matchScore && matchVeg && matchQuery;
    });
  }, [searchQuery, selectedZone, minScoreOnly, vegOnly]);

  const signedInFirstName = authSession?.user.name
    ? (authSession.user.name.split(' ')[0] ?? 'Account')
    : null;

  return (
    <>
      <a href="#main-content" className="skip-link visually-hidden">
        Skip to main content
      </a>

      <Header
        headerZoneLabel={headerZoneLabel}
        signedInFirstName={signedInFirstName}
        onOpenPilotInfo={() => setPilotInfoOpen(true)}
        onOpenAuthModal={() => setAuthModalOpen(true)}
      />

      <main id="main-content" tabIndex={-1}>
        <HeroSection
          searchQuery={searchQuery}
          selectedZone={selectedZone}
          onSearchChange={setSearchQuery}
          onSelectZone={setSelectedZone}
        />

        <KitchenDiscovery
          kitchens={filteredKitchens}
          selectedZoneLabel={selectedZoneLabel}
          minScoreOnly={minScoreOnly}
          vegOnly={vegOnly}
          onToggleMinScore={() => setMinScoreOnly((prev) => !prev)}
          onToggleVegOnly={() => setVegOnly((prev) => !prev)}
          onOpenTrustProfile={(kitchen) => setSelectedTrustKitchen(kitchen)}
        />

        <BengaliBanner
          inEnglish={bannerInEnglish}
          onToggleLanguage={() => setBannerInEnglish((prev) => !prev)}
        />

        <PillarsSection />
      </main>

      <TrustProfileDialog
        kitchen={selectedTrustKitchen}
        onClose={() => setSelectedTrustKitchen(null)}
      />

      <PilotInfoDialog open={pilotInfoOpen} onClose={() => setPilotInfoOpen(false)} />

      <AuthDialog
        open={authModalOpen}
        session={authSession}
        onSessionChange={setAuthSession}
        onClose={() => setAuthModalOpen(false)}
      />

      <Footer />
    </>
  );
}
