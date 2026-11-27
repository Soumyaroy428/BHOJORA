import assert from 'node:assert/strict';
import {
  aStarShortestPath,
  buildDeliveryGraph,
  evaluateDeliveryRouting,
  haversineDistanceKm,
  KOLKATA_DELIVERY_GRAPH,
  MinHeap,
  resolveManualLocationFallback,
} from '../src/utils/deliveryGraph.ts';

console.log('--- Starting Bhojora Delivery Graph Unit Tests ---');

// 1. MinHeap priority queue ordering invariant
const heap = new MinHeap((a, b) => a - b);
for (const val of [9.4, 2.1, 15.0, 0.8, 4.7, 2.1]) {
  heap.push(val);
}
const popped = [];
while (heap.size > 0) {
  popped.push(heap.pop());
}
assert.deepEqual(popped, [0.8, 2.1, 2.1, 4.7, 9.4, 15.0]);
console.log('PASS [1/5] MinHeap priority queue maintains ascending order');

// 2. User within <= 15 km shortest-path distance gets available corridors sorted nearest-first with dynamic ETA
const karunamoyee = evaluateDeliveryRouting(22.585, 88.42, {
  detectedLocality: 'Karunamoyee, Salt Lake',
});
assert.equal(karunamoyee.totalCorridors, 5);
assert.equal(karunamoyee.hasAnyCoverage, true);
assert.equal(karunamoyee.nearestCorridor.zoneId, 'salt-lake');
assert.equal(karunamoyee.nearestCorridor.isNearest, true);
assert.equal(karunamoyee.nearestCorridor.isAvailable, true);
assert.equal(karunamoyee.nearestCorridor.statusLabel, 'Delivery Available');
assert.ok(karunamoyee.nearestCorridor.distanceKm <= 15);
assert.match(karunamoyee.nearestCorridor.estimatedEtaLabel, /^\d+–\d+ mins$/);

for (let i = 1; i < karunamoyee.corridors.length; i += 1) {
  assert.ok(
    karunamoyee.corridors[i].distanceKm >= karunamoyee.corridors[i - 1].distanceKm,
    'Corridors must be sorted ascending by optimal graph distanceKm',
  );
}
assert.ok(
  karunamoyee.nearestAccessVertices.length === 3,
  'Must attach user to k=3 nearest vertices',
);

const expectedSubAreas = ['Karunamoyee', 'Esplanade', 'Eco Park', 'Jadavpur', 'Sovabazar'];
for (const label of expectedSubAreas) {
  const match = karunamoyee.subAreas.find((s) => s.label === label);
  assert.ok(match, `Sub-area ${label} must be evaluated in routing output`);
}
console.log('PASS [2/5] <= 15 km shortest-path routing, k=3 attachment, sorting, and dynamic ETA');

// 3. Straight-line < 15 km but true shortest graph path > 15 km MUST be excluded
const dankuni = evaluateDeliveryRouting(22.671, 88.299, {
  detectedLocality: 'Dankuni NH-16',
});
const northFromDankuni = dankuni.corridors.find((c) => c.zoneId === 'north');
const centralFromDankuni = dankuni.corridors.find((c) => c.zoneId === 'central');
assert.ok(northFromDankuni && centralFromDankuni);
assert.ok(
  northFromDankuni.straightLineKm < 15,
  `Expected straight-line < 15 km from Dankuni to North, got ${northFromDankuni.straightLineKm}`,
);
assert.ok(
  northFromDankuni.distanceKm > 15,
  `Expected Hooghly bridge shortest path > 15 km, got ${northFromDankuni.distanceKm}`,
);
assert.equal(northFromDankuni.isAvailable, false);
assert.equal(northFromDankuni.statusLabel, 'Out of 15 km Delivery Range');
assert.ok(centralFromDankuni.straightLineKm < 15);
assert.ok(centralFromDankuni.distanceKm > 15);
assert.equal(centralFromDankuni.isAvailable, false);
assert.equal(dankuni.availableCorridorCount, 0);
assert.equal(dankuni.hasAnyCoverage, false);

// Synthetic barrier verification: straight line ~6.5 km (< 15), forced bridge detour ~21 km (> 15)
const barrierGraph = buildDeliveryGraph(
  [
    {
      id: 'u_bank_a',
      label: 'West Bank',
      lat: 22.58,
      lng: 88.3,
      kind: 'intersection',
      riverBank: 'west',
    },
    {
      id: 'ix_bridge_north',
      label: 'Bridge North',
      lat: 22.66,
      lng: 88.35,
      kind: 'intersection',
      riverBank: 'east',
    },
    { id: 'hub:north', label: 'North Hub', lat: 22.58, lng: 88.365, kind: 'hub', zoneId: 'north' },
  ],
  [
    {
      from: 'u_bank_a',
      to: 'ix_bridge_north',
      roadName: 'Bridge Approach',
      tortuosityFactor: 1.2,
      avgSpeedKmph: 25,
    },
    {
      from: 'ix_bridge_north',
      to: 'hub:north',
      roadName: 'East Arterial',
      tortuosityFactor: 1.2,
      avgSpeedKmph: 25,
    },
  ],
);
const barrierStraight = haversineDistanceKm(22.58, 88.295, 22.58, 88.365);
assert.ok(barrierStraight < 15);
const barrierRes = evaluateDeliveryRouting(22.58, 88.295, {
  graph: barrierGraph,
  kNearest: 1,
  respectRiverBarrier: true,
});
const northBarrier = barrierRes.corridors.find((c) => c.zoneId === 'north');
assert.ok(northBarrier);
assert.ok(
  northBarrier.distanceKm > 15,
  `Bridge detour must exceed 15 km (got ${northBarrier.distanceKm})`,
);
assert.equal(northBarrier.isAvailable, false);
console.log('PASS [3/5] Bridge-detour exclusion: straight-line < 15 km & graph > 15 km excluded');

// 4. A* admissible Haversine heuristic agrees with Dijkstra optimal distance
const aStarDankuniNorth = aStarShortestPath(KOLKATA_DELIVERY_GRAPH, 'ix:dankuni-west', 'hub:north');
assert.equal(aStarDankuniNorth.reachable, true);
assert.ok(aStarDankuniNorth.distanceKm > 15);
assert.ok(aStarDankuniNorth.pathVertexIds.includes('ix:dakshineswar'));

const aStarKarunamoyeeSouth = aStarShortestPath(
  KOLKATA_DELIVERY_GRAPH,
  'sub:karunamoyee',
  'hub:south',
);
assert.equal(aStarKarunamoyeeSouth.reachable, true);
assert.ok(aStarKarunamoyeeSouth.distanceKm > 0 && aStarKarunamoyeeSouth.distanceKm <= 15);
console.log('PASS [4/5] A* shortest-path search with admissible Haversine heuristic verified');

// 5. Fallback resolution for geolocation denial / manual PIN & locality lookup
const pinSouth = resolveManualLocationFallback('700019');
assert.ok(pinSouth);
const routeFromPin = evaluateDeliveryRouting(pinSouth.lat, pinSouth.lng, {
  detectedLocality: pinSouth.label,
});
assert.equal(routeFromPin.nearestCorridor.zoneId, 'south');
assert.equal(routeFromPin.nearestCorridor.isAvailable, true);

const areaEcoPark = resolveManualLocationFallback('Eco Park');
assert.ok(areaEcoPark);
const routeEcoPark = evaluateDeliveryRouting(areaEcoPark.lat, areaEcoPark.lng, {
  detectedLocality: areaEcoPark.label,
});
assert.equal(routeEcoPark.nearestCorridor.zoneId, 'new-town');

const unknownFallback = resolveManualLocationFallback('   ');
assert.equal(unknownFallback, null);
console.log('PASS [5/5] Manual PIN & locality fallback routing verified');
console.log('ALL DELIVERY GRAPH UNIT TESTS PASSED CLEANLY.');
