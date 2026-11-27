import type { KolkataZoneId } from '../types/domain';

export type CorridorZoneId = Exclude<KolkataZoneId, 'all'>;
export type RiverBankSide = 'east' | 'west';
export type GraphVertexKind = 'hub' | 'sub_area' | 'intersection';

export interface GraphVertex {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: GraphVertexKind;
  zoneId?: CorridorZoneId;
  riverBank?: RiverBankSide;
}

export interface RoadEdgeSpec {
  from: string;
  to: string;
  roadName: string;
  tortuosityFactor: number;
  avgSpeedKmph: number;
}

export interface GraphEdge {
  to: string;
  roadName: string;
  straightKm: number;
  distanceKm: number;
  travelMinutes: number;
}

export interface DeliveryGraph {
  vertices: ReadonlyMap<string, GraphVertex>;
  adjacency: ReadonlyMap<string, readonly GraphEdge[]>;
}

export interface ZoneRouteMetadata {
  id: CorridorZoneId;
  label: string;
  bengaliName: string;
  hubVertexId: string;
  centerLat: number;
  centerLng: number;
  googleMapQuery: string;
  keyAreas: string;
  verifiedKitchensCount: number;
  minOrderInr: number;
}

export interface SubAreaRouteAssessment {
  id: string;
  label: string;
  zoneId: CorridorZoneId;
  lat: number;
  lng: number;
  straightLineKm: number;
  distanceKm: number;
  travelMinutes: number;
  isAvailable: boolean;
  pathLabels: readonly string[];
}

export interface CorridorRouteAssessment {
  zoneId: CorridorZoneId;
  label: string;
  bengaliName: string;
  centerLat: number;
  centerLng: number;
  googleMapQuery: string;
  keyAreas: string;
  verifiedKitchensCount: number;
  minOrderInr: number;
  straightLineKm: number;
  distanceKm: number;
  travelMinutes: number;
  estimatedEtaLabel: string;
  isAvailable: boolean;
  isNearest: boolean;
  statusLabel: 'Delivery Available' | 'Out of 15 km Delivery Range';
  pathVertexIds: readonly string[];
  pathLabels: readonly string[];
  reachableSubAreas: readonly SubAreaRouteAssessment[];
}

export interface DeliveryRoutingResult {
  userLat: number;
  userLng: number;
  maxRadiusKm: number;
  detectedLocality?: string;
  availableCorridorCount: number;
  totalCorridors: number;
  hasAnyCoverage: boolean;
  nearestCorridor: CorridorRouteAssessment;
  corridors: readonly CorridorRouteAssessment[];
  subAreas: readonly SubAreaRouteAssessment[];
  nearestAccessVertices: readonly { id: string; label: string; distanceKm: number }[];
}

export interface RoutingEvaluationOptions {
  graph?: DeliveryGraph;
  kNearest?: number;
  maxRadiusKm?: number;
  prepBufferMin?: number;
  detectedLocality?: string;
  respectRiverBarrier?: boolean;
}

export interface AStarPathResult {
  reachable: boolean;
  distanceKm: number;
  travelMinutes: number;
  pathVertexIds: readonly string[];
  pathLabels: readonly string[];
  visitedCount: number;
}

export const DEFAULT_DELIVERY_RADIUS_KM = 15.0;
const EARTH_RADIUS_KM = 6371;
const LOCAL_ACCESS_TORTUOSITY = 1.25;
const LOCAL_ACCESS_SPEED_KMPH = 22;

/**
 * Exact great-circle Haversine distance in kilometers (unrounded for graph stability).
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function roundDistanceKm(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Generic binary Min-Heap Priority Queue providing O(log n) push/pop for Dijkstra & A*.
 */
export class MinHeap<T> {
  private readonly items: T[] = [];
  private readonly compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const top = this.items[0];
    if (top === undefined) {
      return undefined;
    }
    const last = this.items.pop();
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    let idx = index;
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const current = this.items[idx]!;
      const parent = this.items[parentIdx]!;
      if (this.compare(current, parent) >= 0) {
        break;
      }
      this.items[idx] = parent;
      this.items[parentIdx] = current;
      idx = parentIdx;
    }
  }

  private sinkDown(index: number): void {
    let idx = index;
    const length = this.items.length;
    while (true) {
      const left = idx * 2 + 1;
      const right = left + 1;
      let smallest = idx;

      if (left < length && this.compare(this.items[left]!, this.items[smallest]!) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.items[right]!, this.items[smallest]!) < 0) {
        smallest = right;
      }
      if (smallest === idx) {
        break;
      }
      const swap = this.items[idx]!;
      this.items[idx] = this.items[smallest]!;
      this.items[smallest] = swap;
      idx = smallest;
    }
  }
}

export const KOLKATA_CORRIDOR_METADATA: readonly ZoneRouteMetadata[] = [
  {
    id: 'salt-lake',
    label: 'Salt Lake (Sector V)',
    bengaliName: 'সল্টলেক ও সেক্টর ৫',
    hubVertexId: 'hub:salt-lake',
    centerLat: 22.5806,
    centerLng: 88.4317,
    googleMapQuery: 'Sector V, Salt Lake, Kolkata, West Bengal 700091',
    keyAreas: 'Karunamoyee, Salt Lake Stadium, Nicco Park, City Centre 1',
    verifiedKitchensCount: 5,
    minOrderInr: 149,
  },
  {
    id: 'central',
    label: 'Central (Park Street)',
    bengaliName: 'পার্ক স্ট্রিট ও মধ্য কলকাতা',
    hubVertexId: 'hub:central',
    centerLat: 22.5535,
    centerLng: 88.3526,
    googleMapQuery: 'Park Street, Kolkata, West Bengal 700016',
    keyAreas: 'Camac Street, Esplanade, Park Circus, Mullick Bazar',
    verifiedKitchensCount: 6,
    minOrderInr: 179,
  },
  {
    id: 'new-town',
    label: 'New Town (Action Area)',
    bengaliName: 'নিউ টাউন ও রাজারহাট',
    hubVertexId: 'hub:new-town',
    centerLat: 22.5922,
    centerLng: 88.4655,
    googleMapQuery: 'Action Area I, New Town, Kolkata, West Bengal 700156',
    keyAreas: 'Action Area I, II, III, Eco Park, City Centre 2',
    verifiedKitchensCount: 4,
    minOrderInr: 149,
  },
  {
    id: 'south',
    label: 'South (Ballygunge)',
    bengaliName: 'বালিগঞ্জ ও দক্ষিণ কলকাতা',
    hubVertexId: 'hub:south',
    centerLat: 22.5262,
    centerLng: 88.3665,
    googleMapQuery: 'Ballygunge, Kolkata, West Bengal 700019',
    keyAreas: 'Gariahat, Jadavpur, Kasba, Southern Avenue, Dhakuria',
    verifiedKitchensCount: 5,
    minOrderInr: 149,
  },
  {
    id: 'north',
    label: 'North (Shyambazar)',
    bengaliName: 'শ্যামবাজার ও উত্তর কলকাতা',
    hubVertexId: 'hub:north',
    centerLat: 22.6012,
    centerLng: 88.3735,
    googleMapQuery: 'Shyambazar Five Point Crossing, Kolkata, West Bengal 700004',
    keyAreas: 'Hatibagan, Sovabazar, Bagbazar, Girish Park',
    verifiedKitchensCount: 4,
    minOrderInr: 149,
  },
];

export const KOLKATA_GRAPH_VERTICES: readonly GraphVertex[] = [
  // 5 Primary Corridor Hubs
  {
    id: 'hub:salt-lake',
    label: 'Salt Lake (Sector V)',
    lat: 22.5806,
    lng: 88.4317,
    kind: 'hub',
    zoneId: 'salt-lake',
  },
  {
    id: 'hub:central',
    label: 'Central (Park Street)',
    lat: 22.5535,
    lng: 88.3526,
    kind: 'hub',
    zoneId: 'central',
  },
  {
    id: 'hub:new-town',
    label: 'New Town (Action Area)',
    lat: 22.5922,
    lng: 88.4655,
    kind: 'hub',
    zoneId: 'new-town',
  },
  {
    id: 'hub:south',
    label: 'South (Ballygunge)',
    lat: 22.5262,
    lng: 88.3665,
    kind: 'hub',
    zoneId: 'south',
  },
  {
    id: 'hub:north',
    label: 'North (Shyambazar)',
    lat: 22.6012,
    lng: 88.3735,
    kind: 'hub',
    zoneId: 'north',
  },

  // Salt Lake Sub-Localities
  {
    id: 'sub:karunamoyee',
    label: 'Karunamoyee',
    lat: 22.5863,
    lng: 88.4192,
    kind: 'sub_area',
    zoneId: 'salt-lake',
  },
  {
    id: 'sub:sl-stadium',
    label: 'Salt Lake Stadium',
    lat: 22.5688,
    lng: 88.409,
    kind: 'sub_area',
    zoneId: 'salt-lake',
  },
  {
    id: 'sub:nicco-park',
    label: 'Nicco Park',
    lat: 22.5715,
    lng: 88.4209,
    kind: 'sub_area',
    zoneId: 'salt-lake',
  },
  {
    id: 'sub:cc1',
    label: 'City Centre 1',
    lat: 22.5889,
    lng: 88.4098,
    kind: 'sub_area',
    zoneId: 'salt-lake',
  },

  // Central Sub-Localities
  {
    id: 'sub:camac-street',
    label: 'Camac Street',
    lat: 22.5504,
    lng: 88.3521,
    kind: 'sub_area',
    zoneId: 'central',
  },
  {
    id: 'sub:esplanade',
    label: 'Esplanade',
    lat: 22.5649,
    lng: 88.3516,
    kind: 'sub_area',
    zoneId: 'central',
  },
  {
    id: 'sub:park-circus',
    label: 'Park Circus',
    lat: 22.5432,
    lng: 88.3667,
    kind: 'sub_area',
    zoneId: 'central',
  },
  {
    id: 'sub:mullick-bazar',
    label: 'Mullick Bazar',
    lat: 22.5494,
    lng: 88.3612,
    kind: 'sub_area',
    zoneId: 'central',
  },

  // New Town Sub-Localities
  {
    id: 'sub:aa1',
    label: 'Action Area I',
    lat: 22.5805,
    lng: 88.4589,
    kind: 'sub_area',
    zoneId: 'new-town',
  },
  {
    id: 'sub:aa2',
    label: 'Action Area II',
    lat: 22.5974,
    lng: 88.4744,
    kind: 'sub_area',
    zoneId: 'new-town',
  },
  {
    id: 'sub:aa3',
    label: 'Action Area III',
    lat: 22.5698,
    lng: 88.5008,
    kind: 'sub_area',
    zoneId: 'new-town',
  },
  {
    id: 'sub:eco-park',
    label: 'Eco Park',
    lat: 22.6017,
    lng: 88.4675,
    kind: 'sub_area',
    zoneId: 'new-town',
  },
  {
    id: 'sub:cc2',
    label: 'City Centre 2',
    lat: 22.6213,
    lng: 88.4488,
    kind: 'sub_area',
    zoneId: 'new-town',
  },

  // South Sub-Localities
  {
    id: 'sub:gariahat',
    label: 'Gariahat',
    lat: 22.5177,
    lng: 88.3654,
    kind: 'sub_area',
    zoneId: 'south',
  },
  {
    id: 'sub:jadavpur',
    label: 'Jadavpur',
    lat: 22.4989,
    lng: 88.3694,
    kind: 'sub_area',
    zoneId: 'south',
  },
  {
    id: 'sub:kasba',
    label: 'Kasba',
    lat: 22.515,
    lng: 88.3845,
    kind: 'sub_area',
    zoneId: 'south',
  },
  {
    id: 'sub:southern-ave',
    label: 'Southern Avenue',
    lat: 22.5122,
    lng: 88.3545,
    kind: 'sub_area',
    zoneId: 'south',
  },
  {
    id: 'sub:dhakuria',
    label: 'Dhakuria',
    lat: 22.5071,
    lng: 88.3662,
    kind: 'sub_area',
    zoneId: 'south',
  },

  // North Sub-Localities
  {
    id: 'sub:hatibagan',
    label: 'Hatibagan',
    lat: 22.5964,
    lng: 88.3712,
    kind: 'sub_area',
    zoneId: 'north',
  },
  {
    id: 'sub:sovabazar',
    label: 'Sovabazar',
    lat: 22.597,
    lng: 88.3638,
    kind: 'sub_area',
    zoneId: 'north',
  },
  {
    id: 'sub:bagbazar',
    label: 'Bagbazar',
    lat: 22.6033,
    lng: 88.3651,
    kind: 'sub_area',
    zoneId: 'north',
  },
  {
    id: 'sub:girish-park',
    label: 'Girish Park',
    lat: 22.5855,
    lng: 88.3627,
    kind: 'sub_area',
    zoneId: 'north',
  },

  // Major Arterial Intersections & Bridge Crossings (East Bank)
  {
    id: 'ix:chingrighata',
    label: 'EM Bypass – Chingrighata',
    lat: 22.5596,
    lng: 88.4044,
    kind: 'intersection',
  },
  {
    id: 'ix:science-city',
    label: 'EM Bypass – Science City',
    lat: 22.5396,
    lng: 88.3964,
    kind: 'intersection',
  },
  {
    id: 'ix:ruby',
    label: 'EM Bypass – Ruby Crossing',
    lat: 22.5137,
    lng: 88.4017,
    kind: 'intersection',
  },
  {
    id: 'ix:maa-flyover',
    label: 'Maa Flyover East Ramp',
    lat: 22.5409,
    lng: 88.3842,
    kind: 'intersection',
  },
  {
    id: 'ix:exide',
    label: 'AJC Bose Rd – Exide Crossing',
    lat: 22.5402,
    lng: 88.3471,
    kind: 'intersection',
  },
  {
    id: 'ix:ultadanga',
    label: 'VIP Road – Ultadanga Crossing',
    lat: 22.5944,
    lng: 88.3941,
    kind: 'intersection',
  },
  {
    id: 'ix:baguiati',
    label: 'VIP Road – Baguiati',
    lat: 22.6169,
    lng: 88.431,
    kind: 'intersection',
  },
  {
    id: 'ix:airport',
    label: 'VIP Road – Airport Gate 1',
    lat: 22.6462,
    lng: 88.4366,
    kind: 'intersection',
  },
  {
    id: 'ix:shyambazar-5pt',
    label: 'Shyambazar 5-Point Crossing',
    lat: 22.6018,
    lng: 88.3736,
    kind: 'intersection',
  },
  {
    id: 'ix:dunlop',
    label: 'BT Road – Dunlop Crossing',
    lat: 22.6531,
    lng: 88.3775,
    kind: 'intersection',
  },
  {
    id: 'ix:dakshineswar',
    label: 'Vivekananda Setu East (Dakshineswar)',
    lat: 22.6552,
    lng: 88.3568,
    kind: 'intersection',
  },
  {
    id: 'ix:howrah-bridge-east',
    label: 'Rabindra Setu East (Burrabazar)',
    lat: 22.5856,
    lng: 88.349,
    kind: 'intersection',
  },
  {
    id: 'ix:vidyasagar-east',
    label: 'Vidyasagar Setu East (Princep Ghat)',
    lat: 22.5569,
    lng: 88.3374,
    kind: 'intersection',
  },

  // West Bank Hooghly Crossings (Bridge-Gated Nodes)
  {
    id: 'ix:howrah-west',
    label: 'Howrah Station (Rabindra Setu West)',
    lat: 22.5839,
    lng: 88.3426,
    kind: 'intersection',
    riverBank: 'west',
  },
  {
    id: 'ix:vidyasagar-west',
    label: 'Shibpur (Vidyasagar Setu West)',
    lat: 22.5674,
    lng: 88.3168,
    kind: 'intersection',
    riverBank: 'west',
  },
  {
    id: 'ix:bally-west',
    label: 'Bally (Nivedita Setu West)',
    lat: 22.6485,
    lng: 88.3422,
    kind: 'intersection',
    riverBank: 'west',
  },
  {
    id: 'ix:liluah-west',
    label: 'Liluah GT Road',
    lat: 22.6205,
    lng: 88.3412,
    kind: 'intersection',
    riverBank: 'west',
  },
  {
    id: 'ix:dankuni-west',
    label: 'Dankuni NH-16 Crossing',
    lat: 22.671,
    lng: 88.299,
    kind: 'intersection',
    riverBank: 'west',
  },
];

export const KOLKATA_ROAD_EDGES: readonly RoadEdgeSpec[] = [
  // Salt Lake Corridor Mesh
  {
    from: 'hub:salt-lake',
    to: 'sub:nicco-park',
    roadName: 'Sector V Ring Rd',
    tortuosityFactor: 1.2,
    avgSpeedKmph: 26,
  },
  {
    from: 'hub:salt-lake',
    to: 'sub:karunamoyee',
    roadName: 'Broadway Rd',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 25,
  },
  {
    from: 'sub:karunamoyee',
    to: 'sub:cc1',
    roadName: '1st Avenue',
    tortuosityFactor: 1.2,
    avgSpeedKmph: 24,
  },
  {
    from: 'sub:cc1',
    to: 'ix:ultadanga',
    roadName: 'HUDCO Link Rd',
    tortuosityFactor: 1.25,
    avgSpeedKmph: 23,
  },
  {
    from: 'sub:nicco-park',
    to: 'sub:sl-stadium',
    roadName: 'EM Bypass Service Rd',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 26,
  },
  {
    from: 'sub:sl-stadium',
    to: 'ix:chingrighata',
    roadName: 'EM Bypass',
    tortuosityFactor: 1.18,
    avgSpeedKmph: 32,
  },
  {
    from: 'sub:nicco-park',
    to: 'ix:chingrighata',
    roadName: 'Chingrighata Flyover',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 28,
  },

  // New Town Corridor Mesh
  {
    from: 'hub:salt-lake',
    to: 'sub:aa1',
    roadName: 'Biswa Bangla Sarani',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 34,
  },
  {
    from: 'sub:aa1',
    to: 'hub:new-town',
    roadName: 'Major Arterial Rd',
    tortuosityFactor: 1.18,
    avgSpeedKmph: 36,
  },
  {
    from: 'hub:new-town',
    to: 'sub:eco-park',
    roadName: 'Biswa Bangla Sarani',
    tortuosityFactor: 1.18,
    avgSpeedKmph: 36,
  },
  {
    from: 'hub:new-town',
    to: 'sub:aa2',
    roadName: 'Action Area II Link Rd',
    tortuosityFactor: 1.2,
    avgSpeedKmph: 32,
  },
  {
    from: 'sub:eco-park',
    to: 'sub:aa2',
    roadName: 'Eco Park Arterial',
    tortuosityFactor: 1.2,
    avgSpeedKmph: 34,
  },
  {
    from: 'sub:eco-park',
    to: 'sub:cc2',
    roadName: 'New Town Express Corridor',
    tortuosityFactor: 1.2,
    avgSpeedKmph: 34,
  },
  {
    from: 'sub:aa1',
    to: 'sub:aa3',
    roadName: 'Street 111 / Shapoorji Corridor',
    tortuosityFactor: 1.28,
    avgSpeedKmph: 30,
  },
  {
    from: 'sub:cc2',
    to: 'ix:airport',
    roadName: 'VIP Road Airport Spur',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 34,
  },
  {
    from: 'sub:cc2',
    to: 'ix:baguiati',
    roadName: 'Rajarhat Main Rd',
    tortuosityFactor: 1.28,
    avgSpeedKmph: 24,
  },

  // VIP Road & North Arterial
  {
    from: 'ix:airport',
    to: 'ix:baguiati',
    roadName: 'VIP Road',
    tortuosityFactor: 1.18,
    avgSpeedKmph: 32,
  },
  {
    from: 'ix:baguiati',
    to: 'ix:ultadanga',
    roadName: 'VIP Road',
    tortuosityFactor: 1.2,
    avgSpeedKmph: 28,
  },
  {
    from: 'ix:baguiati',
    to: 'sub:karunamoyee',
    roadName: 'Kestopur–Salt Lake Footbridge/Approach',
    tortuosityFactor: 1.35,
    avgSpeedKmph: 20,
  },
  {
    from: 'ix:ultadanga',
    to: 'ix:shyambazar-5pt',
    roadName: 'Aurobindo Sarani',
    tortuosityFactor: 1.24,
    avgSpeedKmph: 21,
  },
  {
    from: 'ix:shyambazar-5pt',
    to: 'hub:north',
    roadName: 'Shyambazar Crossing',
    tortuosityFactor: 1.15,
    avgSpeedKmph: 20,
  },
  {
    from: 'hub:north',
    to: 'sub:hatibagan',
    roadName: 'Bidhan Sarani',
    tortuosityFactor: 1.2,
    avgSpeedKmph: 19,
  },
  {
    from: 'hub:north',
    to: 'sub:bagbazar',
    roadName: 'Bhupendra Bose Ave',
    tortuosityFactor: 1.2,
    avgSpeedKmph: 20,
  },
  {
    from: 'sub:bagbazar',
    to: 'sub:sovabazar',
    roadName: 'Chitpur Rd',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 18,
  },
  {
    from: 'sub:hatibagan',
    to: 'sub:sovabazar',
    roadName: 'Grey Street',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 18,
  },
  {
    from: 'sub:hatibagan',
    to: 'sub:girish-park',
    roadName: 'CR Avenue',
    tortuosityFactor: 1.2,
    avgSpeedKmph: 21,
  },
  {
    from: 'ix:shyambazar-5pt',
    to: 'ix:dunlop',
    roadName: 'BT Road',
    tortuosityFactor: 1.18,
    avgSpeedKmph: 24,
  },
  {
    from: 'ix:dunlop',
    to: 'ix:dakshineswar',
    roadName: 'Belghoria Expy Approach',
    tortuosityFactor: 1.2,
    avgSpeedKmph: 28,
  },

  // Central Corridor & CR Avenue / AJC Bose Spine
  {
    from: 'sub:girish-park',
    to: 'sub:esplanade',
    roadName: 'CR Avenue',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 20,
  },
  {
    from: 'sub:sovabazar',
    to: 'ix:howrah-bridge-east',
    roadName: 'Strand Rd',
    tortuosityFactor: 1.24,
    avgSpeedKmph: 18,
  },
  {
    from: 'ix:howrah-bridge-east',
    to: 'sub:esplanade',
    roadName: 'Brabourne Rd',
    tortuosityFactor: 1.25,
    avgSpeedKmph: 17,
  },
  {
    from: 'sub:esplanade',
    to: 'hub:central',
    roadName: 'Jawaharlal Nehru Rd',
    tortuosityFactor: 1.2,
    avgSpeedKmph: 21,
  },
  {
    from: 'hub:central',
    to: 'sub:camac-street',
    roadName: 'Park Street / Camac St',
    tortuosityFactor: 1.18,
    avgSpeedKmph: 20,
  },
  {
    from: 'hub:central',
    to: 'sub:mullick-bazar',
    roadName: 'Park Street',
    tortuosityFactor: 1.2,
    avgSpeedKmph: 20,
  },
  {
    from: 'sub:mullick-bazar',
    to: 'sub:park-circus',
    roadName: 'AJC Bose Rd / Park Circus',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 21,
  },
  {
    from: 'sub:camac-street',
    to: 'ix:exide',
    roadName: 'AJC Bose Rd',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 22,
  },
  {
    from: 'ix:exide',
    to: 'ix:vidyasagar-east',
    roadName: 'AJC Bose Rd / Hastings',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 26,
  },
  {
    from: 'sub:esplanade',
    to: 'ix:vidyasagar-east',
    roadName: 'Red Road',
    tortuosityFactor: 1.18,
    avgSpeedKmph: 28,
  },

  // Maa Flyover & EM Bypass Fast Connector
  {
    from: 'sub:park-circus',
    to: 'ix:maa-flyover',
    roadName: 'Maa Flyover',
    tortuosityFactor: 1.16,
    avgSpeedKmph: 38,
  },
  {
    from: 'ix:maa-flyover',
    to: 'ix:science-city',
    roadName: 'Maa Flyover Ramp',
    tortuosityFactor: 1.18,
    avgSpeedKmph: 34,
  },
  {
    from: 'ix:science-city',
    to: 'ix:chingrighata',
    roadName: 'EM Bypass',
    tortuosityFactor: 1.16,
    avgSpeedKmph: 36,
  },
  {
    from: 'ix:science-city',
    to: 'ix:ruby',
    roadName: 'EM Bypass',
    tortuosityFactor: 1.16,
    avgSpeedKmph: 36,
  },

  // South Corridor Mesh
  {
    from: 'ix:exide',
    to: 'hub:south',
    roadName: 'Gurusaday Dutta Rd / Ballygunge',
    tortuosityFactor: 1.24,
    avgSpeedKmph: 22,
  },
  {
    from: 'sub:park-circus',
    to: 'hub:south',
    roadName: 'Syed Amir Ali Ave',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 22,
  },
  {
    from: 'hub:south',
    to: 'sub:gariahat',
    roadName: 'Gariahat Rd',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 19,
  },
  {
    from: 'sub:gariahat',
    to: 'sub:southern-ave',
    roadName: 'Southern Avenue',
    tortuosityFactor: 1.2,
    avgSpeedKmph: 22,
  },
  {
    from: 'sub:gariahat',
    to: 'sub:kasba',
    roadName: 'Rashbehari Connector',
    tortuosityFactor: 1.24,
    avgSpeedKmph: 22,
  },
  {
    from: 'sub:kasba',
    to: 'ix:ruby',
    roadName: 'Rashbehari Connector',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 26,
  },
  {
    from: 'sub:gariahat',
    to: 'sub:dhakuria',
    roadName: 'Gariahat Rd South',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 20,
  },
  {
    from: 'sub:dhakuria',
    to: 'sub:jadavpur',
    roadName: 'Raja SC Mullick Rd',
    tortuosityFactor: 1.22,
    avgSpeedKmph: 20,
  },
  {
    from: 'ix:ruby',
    to: 'sub:jadavpur',
    roadName: 'Prince Anwar Shah Connector',
    tortuosityFactor: 1.26,
    avgSpeedKmph: 24,
  },

  // Hooghly River Bridges (Only cross-river edges!)
  {
    from: 'ix:howrah-west',
    to: 'ix:howrah-bridge-east',
    roadName: 'Rabindra Setu (Howrah Bridge)',
    tortuosityFactor: 1.35,
    avgSpeedKmph: 16,
  },
  {
    from: 'ix:vidyasagar-west',
    to: 'ix:vidyasagar-east',
    roadName: 'Vidyasagar Setu (2nd Hooghly Bridge)',
    tortuosityFactor: 1.28,
    avgSpeedKmph: 32,
  },
  {
    from: 'ix:bally-west',
    to: 'ix:dakshineswar',
    roadName: 'Nivedita / Vivekananda Setu',
    tortuosityFactor: 1.3,
    avgSpeedKmph: 30,
  },

  // West Bank Corridors (Howrah / Bally / Dankuni)
  {
    from: 'ix:vidyasagar-west',
    to: 'ix:howrah-west',
    roadName: 'Kona / Foreshore Rd',
    tortuosityFactor: 1.32,
    avgSpeedKmph: 22,
  },
  {
    from: 'ix:howrah-west',
    to: 'ix:liluah-west',
    roadName: 'GT Road North',
    tortuosityFactor: 1.32,
    avgSpeedKmph: 20,
  },
  {
    from: 'ix:liluah-west',
    to: 'ix:bally-west',
    roadName: 'GT Road / Belur',
    tortuosityFactor: 1.32,
    avgSpeedKmph: 22,
  },
  {
    from: 'ix:bally-west',
    to: 'ix:dankuni-west',
    roadName: 'Delhi Rd / NH-16',
    tortuosityFactor: 1.45,
    avgSpeedKmph: 28,
  },
  {
    from: 'ix:vidyasagar-west',
    to: 'ix:dankuni-west',
    roadName: 'Kona Expy NH-117',
    tortuosityFactor: 1.4,
    avgSpeedKmph: 30,
  },
];

export function buildDeliveryGraph(
  verticesInput: readonly GraphVertex[] = KOLKATA_GRAPH_VERTICES,
  edgeSpecs: readonly RoadEdgeSpec[] = KOLKATA_ROAD_EDGES,
): DeliveryGraph {
  const vertices = new Map<string, GraphVertex>();
  const adjacency = new Map<string, GraphEdge[]>();

  for (const vertex of verticesInput) {
    vertices.set(vertex.id, vertex);
    adjacency.set(vertex.id, []);
  }

  for (const spec of edgeSpecs) {
    const a = vertices.get(spec.from);
    const b = vertices.get(spec.to);
    if (!a || !b) {
      continue;
    }
    const straightKm = haversineDistanceKm(a.lat, a.lng, b.lat, b.lng);
    const distanceKm = straightKm * spec.tortuosityFactor;
    const travelMinutes = (distanceKm / spec.avgSpeedKmph) * 60;

    adjacency.get(spec.from)?.push({
      to: spec.to,
      roadName: spec.roadName,
      straightKm,
      distanceKm,
      travelMinutes,
    });
    adjacency.get(spec.to)?.push({
      to: spec.from,
      roadName: spec.roadName,
      straightKm,
      distanceKm,
      travelMinutes,
    });
  }

  return { vertices, adjacency };
}

export const KOLKATA_DELIVERY_GRAPH: DeliveryGraph = buildDeliveryGraph();

/**
 * Estimates whether coordinates sit on the West bank vs East bank of the Hooghly River
 * along the Kolkata metro stretch (lat 22.52–22.68) so local access edges do not cross
 * open water where only dedicated bridges connect the banks.
 */
export function inferHooghlyBank(lat: number, lng: number): RiverBankSide {
  if (lat < 22.52 || lat > 22.7) {
    return lng < 88.33 ? 'west' : 'east';
  }
  const riverCenterLng = 88.315 + ((lat - 22.53) / (22.655 - 22.53)) * (88.351 - 88.315);
  return lng < riverCenterLng ? 'west' : 'east';
}

interface DijkstraState {
  distKm: Map<string, number>;
  travelMin: Map<string, number>;
  prev: Map<string, string | null>;
}

function reconstructPath(
  prev: ReadonlyMap<string, string | null>,
  vertices: ReadonlyMap<string, GraphVertex>,
  startId: string,
  targetId: string,
): { ids: string[]; labels: string[] } {
  const ids: string[] = [];
  let cursor: string | null | undefined = targetId;
  let guard = 0;
  while (cursor && guard <= vertices.size + 2) {
    ids.push(cursor);
    if (cursor === startId) {
      break;
    }
    cursor = prev.get(cursor);
    guard += 1;
  }
  ids.reverse();
  const labels = ids.map((id) => vertices.get(id)?.label ?? id);
  return { ids, labels };
}

/**
 * Runs Dijkstra's shortest-path algorithm with a binary Min-Heap (O((V + E) log V))
 * from `startId` across the weighted road graph.
 */
export function runDijkstraFromSource(
  vertices: ReadonlyMap<string, GraphVertex>,
  adjacency: ReadonlyMap<string, readonly GraphEdge[]>,
  startId: string,
): DijkstraState {
  const distKm = new Map<string, number>();
  const travelMin = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const visited = new Set<string>();

  for (const id of vertices.keys()) {
    distKm.set(id, Number.POSITIVE_INFINITY);
    travelMin.set(id, Number.POSITIVE_INFINITY);
    prev.set(id, null);
  }
  distKm.set(startId, 0);
  travelMin.set(startId, 0);

  const heap = new MinHeap<{ id: string; dist: number }>((a, b) => a.dist - b.dist);
  heap.push({ id: startId, dist: 0 });

  while (heap.size > 0) {
    const current = heap.pop();
    if (!current || visited.has(current.id)) {
      continue;
    }
    visited.add(current.id);

    const neighbors = adjacency.get(current.id) ?? [];
    const currentDist = distKm.get(current.id) ?? Number.POSITIVE_INFINITY;
    const currentMin = travelMin.get(current.id) ?? Number.POSITIVE_INFINITY;

    for (const edge of neighbors) {
      if (visited.has(edge.to)) {
        continue;
      }
      const nextDist = currentDist + edge.distanceKm;
      const nextMin = currentMin + edge.travelMinutes;
      if (nextDist < (distKm.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distKm.set(edge.to, nextDist);
        travelMin.set(edge.to, nextMin);
        prev.set(edge.to, current.id);
        heap.push({ id: edge.to, dist: nextDist });
      }
    }
  }

  return { distKm, travelMin, prev };
}

/**
 * A* point-to-point shortest-path query using exact Haversine distance as an
 * admissible heuristic h(n) (since every edge weight w(e) >= Haversine straightKm).
 */
export function aStarShortestPath(
  graph: DeliveryGraph,
  startId: string,
  goalId: string,
): AStarPathResult {
  const start = graph.vertices.get(startId);
  const goal = graph.vertices.get(goalId);
  if (!start || !goal) {
    return {
      reachable: false,
      distanceKm: Number.POSITIVE_INFINITY,
      travelMinutes: Number.POSITIVE_INFINITY,
      pathVertexIds: [],
      pathLabels: [],
      visitedCount: 0,
    };
  }

  const gScore = new Map<string, number>([[startId, 0]]);
  const travelScore = new Map<string, number>([[startId, 0]]);
  const prev = new Map<string, string | null>([[startId, null]]);
  const closed = new Set<string>();

  const heap = new MinHeap<{ id: string; fScore: number }>((a, b) => a.fScore - b.fScore);
  heap.push({
    id: startId,
    fScore: haversineDistanceKm(start.lat, start.lng, goal.lat, goal.lng),
  });

  while (heap.size > 0) {
    const current = heap.pop();
    if (!current || closed.has(current.id)) {
      continue;
    }
    if (current.id === goalId) {
      const path = reconstructPath(prev, graph.vertices, startId, goalId);
      return {
        reachable: true,
        distanceKm: roundDistanceKm(gScore.get(goalId) ?? 0),
        travelMinutes: Number((travelScore.get(goalId) ?? 0).toFixed(1)),
        pathVertexIds: path.ids,
        pathLabels: path.labels,
        visitedCount: closed.size + 1,
      };
    }

    closed.add(current.id);
    const currentG = gScore.get(current.id) ?? Number.POSITIVE_INFINITY;
    const currentTime = travelScore.get(current.id) ?? Number.POSITIVE_INFINITY;

    for (const edge of graph.adjacency.get(current.id) ?? []) {
      if (closed.has(edge.to)) {
        continue;
      }
      const tentativeG = currentG + edge.distanceKm;
      if (tentativeG < (gScore.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        const nextVertex = graph.vertices.get(edge.to);
        const h = nextVertex
          ? haversineDistanceKm(nextVertex.lat, nextVertex.lng, goal.lat, goal.lng)
          : 0;
        gScore.set(edge.to, tentativeG);
        travelScore.set(edge.to, currentTime + edge.travelMinutes);
        prev.set(edge.to, current.id);
        heap.push({ id: edge.to, fScore: tentativeG + h });
      }
    }
  }

  return {
    reachable: false,
    distanceKm: Number.POSITIVE_INFINITY,
    travelMinutes: Number.POSITIVE_INFINITY,
    pathVertexIds: [],
    pathLabels: [],
    visitedCount: closed.size,
  };
}

function formatDynamicEtaRange(travelMinutes: number, prepBufferMin: number): string {
  if (!Number.isFinite(travelMinutes)) {
    return 'Unavailable';
  }
  const minEta = Math.max(15, Math.round(prepBufferMin + travelMinutes * 0.9));
  const maxEta = Math.max(minEta + 6, Math.round(prepBufferMin + travelMinutes * 1.25 + 4));
  return `${minEta}–${maxEta} mins`;
}

/**
 * Evaluates all Kolkata service corridors and sub-localities from an arbitrary user `(lat, lng)`
 * using Dijkstra's shortest-path algorithm with dynamic k=3 access-edge attachment.
 */
export function evaluateDeliveryRouting(
  userLat: number,
  userLng: number,
  options: RoutingEvaluationOptions = {},
): DeliveryRoutingResult {
  const graph = options.graph ?? KOLKATA_DELIVERY_GRAPH;
  const kNearest = Math.max(1, options.kNearest ?? 3);
  const maxRadiusKm = options.maxRadiusKm ?? DEFAULT_DELIVERY_RADIUS_KM;
  const prepBufferMin = options.prepBufferMin ?? 12;
  const respectRiverBarrier = options.respectRiverBarrier ?? true;

  const userBank = inferHooghlyBank(userLat, userLng);
  const userVertex: GraphVertex = {
    id: 'u_user',
    label: options.detectedLocality ?? 'Your Location',
    lat: userLat,
    lng: userLng,
    kind: 'intersection',
    riverBank: userBank,
  };

  // Clone vertex/adjacency views to dynamically attach virtual node u_user -> k nearest nodes
  const vertices = new Map<string, GraphVertex>(graph.vertices);
  const adjacency = new Map<string, GraphEdge[]>();
  for (const [id, edges] of graph.adjacency.entries()) {
    adjacency.set(id, [...edges]);
  }
  vertices.set('u_user', userVertex);
  adjacency.set('u_user', []);

  const candidates = Array.from(graph.vertices.values())
    .map((vertex) => ({
      vertex,
      straightKm: haversineDistanceKm(userLat, userLng, vertex.lat, vertex.lng),
      vertexBank: vertex.riverBank ?? 'east',
    }))
    .sort((a, b) => a.straightKm - b.straightKm);

  const sameBankCandidates = respectRiverBarrier
    ? candidates.filter((item) => item.vertexBank === userBank)
    : candidates;
  const selectedPool = sameBankCandidates.length > 0 ? sameBankCandidates : candidates;
  const accessCandidates = selectedPool.slice(0, kNearest);

  const nearestAccessVertices = accessCandidates.map((item) => {
    const weightedKm = item.straightKm * LOCAL_ACCESS_TORTUOSITY;
    const accessMinutes = (weightedKm / LOCAL_ACCESS_SPEED_KMPH) * 60;
    adjacency.get('u_user')?.push({
      to: item.vertex.id,
      roadName: 'Local Access Connector',
      straightKm: item.straightKm,
      distanceKm: weightedKm,
      travelMinutes: accessMinutes,
    });
    adjacency.get(item.vertex.id)?.push({
      to: 'u_user',
      roadName: 'Local Access Connector',
      straightKm: item.straightKm,
      distanceKm: weightedKm,
      travelMinutes: accessMinutes,
    });
    return {
      id: item.vertex.id,
      label: item.vertex.label,
      distanceKm: roundDistanceKm(weightedKm),
    };
  });

  const dijkstra = runDijkstraFromSource(vertices, adjacency, 'u_user');

  const subAreas: SubAreaRouteAssessment[] = [];
  for (const vertex of graph.vertices.values()) {
    if (vertex.kind !== 'sub_area' || !vertex.zoneId) {
      continue;
    }
    const rawDist = dijkstra.distKm.get(vertex.id) ?? Number.POSITIVE_INFINITY;
    const rawMin = dijkstra.travelMin.get(vertex.id) ?? Number.POSITIVE_INFINITY;
    const distanceKm = Number.isFinite(rawDist) ? roundDistanceKm(rawDist) : 999.99;
    const path = reconstructPath(dijkstra.prev, vertices, 'u_user', vertex.id);

    subAreas.push({
      id: vertex.id,
      label: vertex.label,
      zoneId: vertex.zoneId,
      lat: vertex.lat,
      lng: vertex.lng,
      straightLineKm: roundDistanceKm(
        haversineDistanceKm(userLat, userLng, vertex.lat, vertex.lng),
      ),
      distanceKm,
      travelMinutes: Number.isFinite(rawMin) ? Number(rawMin.toFixed(1)) : 999,
      isAvailable: distanceKm <= maxRadiusKm,
      pathLabels: path.labels,
    });
  }
  subAreas.sort((a, b) => a.distanceKm - b.distanceKm);

  const rawCorridors: CorridorRouteAssessment[] = KOLKATA_CORRIDOR_METADATA.map(
    (meta): CorridorRouteAssessment => {
      const rawDist = dijkstra.distKm.get(meta.hubVertexId) ?? Number.POSITIVE_INFINITY;
      const rawMin = dijkstra.travelMin.get(meta.hubVertexId) ?? Number.POSITIVE_INFINITY;
      const distanceKm = Number.isFinite(rawDist) ? roundDistanceKm(rawDist) : 999.99;
      const travelMinutes = Number.isFinite(rawMin) ? Number(rawMin.toFixed(1)) : 999;
      const straightLineKm = roundDistanceKm(
        haversineDistanceKm(userLat, userLng, meta.centerLat, meta.centerLng),
      );
      const isAvailable = distanceKm <= maxRadiusKm;
      const path = reconstructPath(dijkstra.prev, vertices, 'u_user', meta.hubVertexId);
      const reachableSubAreas = subAreas.filter((sub) => sub.zoneId === meta.id && sub.isAvailable);

      return {
        zoneId: meta.id,
        label: meta.label,
        bengaliName: meta.bengaliName,
        centerLat: meta.centerLat,
        centerLng: meta.centerLng,
        googleMapQuery: meta.googleMapQuery,
        keyAreas: meta.keyAreas,
        verifiedKitchensCount: meta.verifiedKitchensCount,
        minOrderInr: meta.minOrderInr,
        straightLineKm,
        distanceKm,
        travelMinutes,
        estimatedEtaLabel: isAvailable
          ? formatDynamicEtaRange(travelMinutes, prepBufferMin)
          : `${distanceKm} km away`,
        isAvailable,
        isNearest: false,
        statusLabel: isAvailable ? 'Delivery Available' : 'Out of 15 km Delivery Range',
        pathVertexIds: path.ids,
        pathLabels: path.labels,
        reachableSubAreas,
      };
    },
  ).sort((a, b) => a.distanceKm - b.distanceKm);

  const corridors = rawCorridors.map((item, idx) => ({
    ...item,
    isNearest: idx === 0,
  }));

  const availableCorridorCount = corridors.filter((item) => item.isAvailable).length;

  return {
    userLat,
    userLng,
    maxRadiusKm,
    detectedLocality: options.detectedLocality,
    availableCorridorCount,
    totalCorridors: corridors.length,
    hasAnyCoverage: availableCorridorCount > 0,
    nearestCorridor: corridors[0]!,
    corridors,
    subAreas,
    nearestAccessVertices,
  };
}

export interface ManualLocationMatch {
  lat: number;
  lng: number;
  label: string;
}

const KOLKATA_MANUAL_PIN_AND_AREA_INDEX: ReadonlyArray<{
  pins: readonly string[];
  keywords: readonly string[];
  lat: number;
  lng: number;
  label: string;
}> = [
  {
    pins: ['700091', '700098', '700106'],
    keywords: ['salt lake', 'sector v', 'sector 5', 'karunamoyee', 'nicco park', 'city centre 1'],
    lat: 22.5806,
    lng: 88.4317,
    label: 'Salt Lake / Sector V (700091)',
  },
  {
    pins: ['700016', '700017', '700014', '700001', '700071'],
    keywords: ['park street', 'camac', 'esplanade', 'park circus', 'mullick bazar', 'central'],
    lat: 22.5535,
    lng: 88.3526,
    label: 'Park Street / Central (700016)',
  },
  {
    pins: ['700156', '700135', '700160', '700102'],
    keywords: ['new town', 'action area', 'eco park', 'city centre 2', 'rajarhat', 'kestopur'],
    lat: 22.5922,
    lng: 88.4655,
    label: 'New Town Action Area (700156)',
  },
  {
    pins: ['700019', '700029', '700032', '700042', '700031'],
    keywords: ['ballygunge', 'gariahat', 'jadavpur', 'kasba', 'southern avenue', 'dhakuria'],
    lat: 22.5262,
    lng: 88.3665,
    label: 'Ballygunge / Gariahat (700019)',
  },
  {
    pins: ['700004', '700005', '700006', '700003'],
    keywords: ['shyambazar', 'hatibagan', 'sovabazar', 'bagbazar', 'girish park', 'north'],
    lat: 22.6012,
    lng: 88.3735,
    label: 'Shyambazar / North Kolkata (700004)',
  },
  {
    pins: ['700052', '700028', '700059'],
    keywords: ['baguiati', 'dum dum', 'airport', 'vip road'],
    lat: 22.6169,
    lng: 88.431,
    label: 'VIP Road / Baguiati (700059)',
  },
  {
    pins: ['700084', '700094', '700099'],
    keywords: ['ruby', 'garia', 'patuli', 'em bypass'],
    lat: 22.4952,
    lng: 88.3935,
    label: 'EM Bypass / South-East (700099)',
  },
  {
    pins: ['711101', '711102', '711103'],
    keywords: ['howrah', 'shibpur'],
    lat: 22.5839,
    lng: 88.3426,
    label: 'Howrah West Bank (711101)',
  },
  {
    pins: ['712311', '712223', '700150'],
    keywords: ['dankuni', 'sonarpur', 'barasat'],
    lat: 22.671,
    lng: 88.299,
    label: 'Outer Metro Fringe',
  },
];

/**
 * Resolves manual address / 6-digit PIN code text when browser GPS permission is denied
 * or the customer checks serviceability manually for another locality.
 */
export function resolveManualLocationFallback(rawQuery: string): ManualLocationMatch | null {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return null;
  }

  const coordMatch = /^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/.exec(query);
  if (coordMatch && coordMatch[1] && coordMatch[2]) {
    const lat = Number(coordMatch[1]);
    const lng = Number(coordMatch[2]);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      return {
        lat,
        lng,
        label: `Custom Coordinates (${lat.toFixed(4)}°, ${lng.toFixed(4)}°)`,
      };
    }
  }

  const pinMatch = /\b(\d{6})\b/.exec(query);
  if (pinMatch?.[1]) {
    const pin = pinMatch[1];
    const byPin = KOLKATA_MANUAL_PIN_AND_AREA_INDEX.find((entry) => entry.pins.includes(pin));
    if (byPin) {
      return { lat: byPin.lat, lng: byPin.lng, label: byPin.label };
    }
  }

  // Exact match against any graph vertex label first for sub-locality accuracy
  for (const vertex of KOLKATA_GRAPH_VERTICES) {
    if (query.includes(vertex.label.toLowerCase()) || vertex.label.toLowerCase().includes(query)) {
      return {
        lat: vertex.lat,
        lng: vertex.lng,
        label: vertex.label,
      };
    }
  }

  const byKeyword = KOLKATA_MANUAL_PIN_AND_AREA_INDEX.find((entry) =>
    entry.keywords.some((kw) => query.includes(kw)),
  );
  if (byKeyword) {
    return { lat: byKeyword.lat, lng: byKeyword.lng, label: byKeyword.label };
  }

  return null;
}
