import type { KitchenOutlet, KolkataZoneId } from '../types/domain';

export interface KolkataZoneOption {
  id: KolkataZoneId;
  label: string;
}

export const KOLKATA_ZONE_OPTIONS: readonly KolkataZoneOption[] = [
  { id: 'all', label: 'All Kolkata' },
  { id: 'salt-lake', label: 'Salt Lake / Sector V' },
  { id: 'central', label: 'Park Street / Central' },
  { id: 'new-town', label: 'New Town' },
  { id: 'south', label: 'Ballygunge / South' },
  { id: 'north', label: 'Shyambazar / North' },
];

export const TRUST_CATEGORY_LABELS: readonly string[] = [
  '1. Food Storage & Cold Chain (25%)',
  '2. Personal Hygiene & Gear (20%)',
  '3. Sanitation & Pest Control (25%)',
  '4. Water & Raw Material Quality (15%)',
  '5. Waste Management & Drainage (15%)',
];

export const VERIFIED_KOLKATA_KITCHENS: readonly KitchenOutlet[] = [
  {
    key: 'arsalan',
    name: 'Arsalan',
    fullName: 'Arsalan (Park Circus)',
    locality: 'Park Circus',
    etaMinutes: '25–35 mins',
    cuisines: 'Mughlai, Kolkata Biryani, Kebabs',
    rating: '4.5',
    reviewCount: '2.4k',
    score: 94,
    auditedMonth: 'Oct 2026',
    auditDate: '14 Oct 2026',
    fssai: '12821008000491',
    isPureVeg: false,
    zones: ['central', 'south', 'salt-lake'],
    searchText: 'arsalan park circus mughlai kolkata biryani kebabs',
    imageUrl:
      'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    categoryPercentages: [96, 92, 95, 90, 96],
  },
  {
    key: 'peter-cat',
    name: 'Peter Cat',
    fullName: 'Peter Cat (Park Street)',
    locality: 'Park Street',
    etaMinutes: '30–40 mins',
    cuisines: 'Continental, Chelo Kebab, Sizzlers',
    rating: '4.6',
    reviewCount: '4.1k',
    score: 92,
    auditedMonth: 'Oct 2026',
    auditDate: '28 Oct 2026',
    fssai: '12820002000189',
    isPureVeg: false,
    zones: ['central', 'salt-lake'],
    searchText: 'peter cat park street continental chelo kebab sizzlers',
    imageUrl:
      'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80',
    categoryPercentages: [94, 90, 92, 88, 95],
  },
  {
    key: 'mocambo',
    name: 'Mocambo',
    fullName: 'Mocambo (Free School St)',
    locality: 'Free School St',
    etaMinutes: '25–35 mins',
    cuisines: 'Heritage Continental, Devilled Crab',
    rating: '4.7',
    reviewCount: '3.8k',
    score: 95,
    auditedMonth: 'Nov 2026',
    auditDate: '02 Nov 2026',
    fssai: '12819001000842',
    isPureVeg: false,
    zones: ['central', 'new-town'],
    searchText: 'mocambo free school st heritage continental devilled crab',
    imageUrl:
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
    categoryPercentages: [96, 94, 96, 92, 96],
  },
  {
    key: 'balaram',
    name: 'Balaram Mullick',
    fullName: 'Balaram Mullick & Radharaman Mullick',
    locality: 'Bhowanipore',
    etaMinutes: '20–30 mins',
    cuisines: 'Bengali Mishti, Baked Rosogolla, Sandesh',
    rating: '4.8',
    reviewCount: '5.2k',
    score: 96,
    auditedMonth: 'Nov 2026',
    auditDate: '05 Nov 2026',
    fssai: '12822004000321',
    isPureVeg: true,
    zones: ['south', 'central', 'salt-lake', 'new-town', 'north'],
    searchText:
      'balaram mullick radharaman bhowanipore bengali mishti baked rosogolla sandesh sweets veg',
    imageUrl:
      'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
    categoryPercentages: [98, 95, 97, 94, 95],
  },
];
