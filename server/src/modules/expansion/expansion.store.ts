import mongoose, { type Document, type Model, Schema } from 'mongoose';
import type { FounderApprovalRequest, GoNoGoDecision, NextCityCandidate } from '@bhojora/shared';

export interface ExpansionStore {
  getFounderSignOff(): Promise<GoNoGoDecision['founderSignOff'] | null>;
  saveFounderSignOff(signOff: NonNullable<GoNoGoDecision['founderSignOff']>): Promise<void>;
  listNextCityCandidates(): Promise<NextCityCandidate[]>;
}

export const INITIAL_NEXT_CITIES: NextCityCandidate[] = [
  {
    cityCode: 'HOWRAH',
    cityName: 'Howrah & Shibpur Metro Corridor',
    state: 'West Bengal',
    proximityToKolkataKm: 12.0,
    targetLaunchQuarter: 'Q1 2027',
    readinessScorePercent: 94.5,
    estimatedInitialMerchantCount: 65,
    keyCulinaryHubs: ['Howrah Station Grand Corridor', 'Shibpur Mandirtala', 'Salkia High Street'],
    strategicRationale:
      'Immediate geographic proximity via Vidyasagar Setu with shared delivery fleet logistics and established river connectivity.',
  },
  {
    cityCode: 'SILIGURI',
    cityName: 'Siliguri & North Bengal Gateway',
    state: 'West Bengal',
    proximityToKolkataKm: 560.0,
    targetLaunchQuarter: 'Q2 2027',
    readinessScorePercent: 88.0,
    estimatedInitialMerchantCount: 80,
    keyCulinaryHubs: ['Sevoke Road Commercial Hub', 'Hill Cart Road', 'Matigara Tech Zone'],
    strategicRationale:
      'Highest-density commercial transit hub of North Bengal and Sikkim with booming hospitality trade and food culture.',
  },
  {
    cityCode: 'DURGAPUR_ASANSOL',
    cityName: 'Durgapur-Asansol Industrial & Educational Corridor',
    state: 'West Bengal',
    proximityToKolkataKm: 175.0,
    targetLaunchQuarter: 'Q3 2027',
    readinessScorePercent: 82.5,
    estimatedInitialMerchantCount: 50,
    keyCulinaryHubs: ['City Centre Durgapur', 'Benachity', 'Asansol Court Area'],
    strategicRationale:
      'Affluent engineering and industrial base with high disposable income and strong appetite for transparent food safety ratings.',
  },
];

export class InMemoryExpansionStore implements ExpansionStore {
  private founderSignOff: GoNoGoDecision['founderSignOff'] | null = null;
  private candidates: NextCityCandidate[] = [...INITIAL_NEXT_CITIES];

  async getFounderSignOff(): Promise<GoNoGoDecision['founderSignOff'] | null> {
    return this.founderSignOff ? { ...this.founderSignOff } : null;
  }

  async saveFounderSignOff(signOff: NonNullable<GoNoGoDecision['founderSignOff']>): Promise<void> {
    this.founderSignOff = { ...signOff };
  }

  async listNextCityCandidates(): Promise<NextCityCandidate[]> {
    return this.candidates.map((c) => ({ ...c }));
  }
}

interface FounderSignOffDoc extends Document {
  founderName: string;
  approvedAt: Date;
  comments: string;
  auditSignature: string;
}

const FounderSignOffSchema = new Schema<FounderSignOffDoc>(
  {
    founderName: { type: String, required: true },
    approvedAt: { type: Date, required: true },
    comments: { type: String, required: true },
    auditSignature: { type: String, required: true },
  },
  { timestamps: true },
);

export class MongooseExpansionStore implements ExpansionStore {
  private fallback = new InMemoryExpansionStore();
  private model: Model<FounderSignOffDoc>;

  constructor() {
    this.model =
      (mongoose.models.FounderSignOff as Model<FounderSignOffDoc>) ||
      mongoose.model<FounderSignOffDoc>('FounderSignOff', FounderSignOffSchema);
  }

  private isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }

  async getFounderSignOff(): Promise<GoNoGoDecision['founderSignOff'] | null> {
    if (!this.isConnected()) {
      return this.fallback.getFounderSignOff();
    }
    const doc = await this.model.findOne().sort({ approvedAt: -1 }).lean();
    if (!doc) return null;
    return {
      founderName: doc.founderName,
      approvedAt: doc.approvedAt.toISOString(),
      comments: doc.comments,
      auditSignature: doc.auditSignature,
    };
  }

  async saveFounderSignOff(signOff: NonNullable<GoNoGoDecision['founderSignOff']>): Promise<void> {
    if (!this.isConnected()) {
      return this.fallback.saveFounderSignOff(signOff);
    }
    await this.model.create({
      founderName: signOff.founderName,
      approvedAt: new Date(signOff.approvedAt),
      comments: signOff.comments,
      auditSignature: signOff.auditSignature,
    });
  }

  async listNextCityCandidates(): Promise<NextCityCandidate[]> {
    return this.fallback.listNextCityCandidates();
  }
}
