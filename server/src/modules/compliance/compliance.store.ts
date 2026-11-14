import mongoose, { type Document, type Model, Schema } from 'mongoose';
import type {
  AdviserSignOff,
  ComplianceCheckItem,
  ComplianceDomain,
  ComplianceItemStatus,
} from '@bhojora/shared';

export interface ComplianceStore {
  saveSignOff(signOff: AdviserSignOff): Promise<AdviserSignOff>;
  listSignOffs(): Promise<AdviserSignOff[]>;
  getSignOffByDomain(domain: ComplianceDomain): Promise<AdviserSignOff | null>;
  listCheckItems(): Promise<ComplianceCheckItem[]>;
  updateCheckItemStatus(
    id: string,
    status: ComplianceItemStatus,
    notes?: string,
  ): Promise<ComplianceCheckItem | null>;
}

export const INITIAL_CHECK_ITEMS: ComplianceCheckItem[] = [
  {
    id: 'CHK_FSSAI_001',
    domain: 'FSSAI_FOOD_SAFETY',
    title: 'Central / State Food Hygiene License & Restaurant Display Verification',
    statutoryReference: 'FSS Act 2006, Section 31 & Licensing Regulations',
    status: 'COMPLIANT',
    verifiedAt: '2026-11-14T09:00:00.000Z',
    notes:
      'Mandatory 14-digit FSSAI license validated during restaurant onboarding before active menu display.',
  },
  {
    id: 'CHK_ECOM_002',
    domain: 'E_COMMERCE_CONSUMER_PROTECTION',
    title: 'Grievance Redressal Officer Designation & 48-Hour Acknowledgment SLA',
    statutoryReference: 'Consumer Protection (E-Commerce) Rules 2020, Rule 5(4) & Rule 6',
    status: 'COMPLIANT',
    verifiedAt: '2026-11-14T09:00:00.000Z',
    notes:
      'Grievance officer publicly published with ticket response within 48h and resolution within 1 month.',
  },
  {
    id: 'CHK_DPDP_003',
    domain: 'DPDP_PRIVACY',
    title: 'Consent-Driven Data Governance & Right-to-Erasure Workflow',
    statutoryReference: 'Digital Personal Data Protection Act 2023, Sections 6, 11 & 12',
    status: 'COMPLIANT',
    verifiedAt: '2026-11-14T09:00:00.000Z',
    notes: 'Automated DSR export and anonymization pipelines operational with PII masking.',
  },
  {
    id: 'CHK_RBI_004',
    domain: 'PAYMENT_ESCROW_RBI',
    title: 'Payment Aggregator Escrow Account & Zero Raw Card Data Retention',
    statutoryReference:
      'RBI Guidelines on Regulation of Payment Aggregators & Gateways (DPSS.CO.PD.No.1810)',
    status: 'COMPLIANT',
    verifiedAt: '2026-11-14T09:00:00.000Z',
    notes:
      'PCI-DSS tokenized card processing; nodal escrow settlements scheduled T+2 business days.',
  },
  {
    id: 'CHK_GST_005',
    domain: 'GST_TAXATION',
    title: 'E-Commerce Operator 5% GST Collection & Tax Invoice Generation',
    statutoryReference: 'CGST Act 2017, Section 9(5) & Notification No. 17/2021-Central Tax (Rate)',
    status: 'COMPLIANT',
    verifiedAt: '2026-11-14T09:00:00.000Z',
    notes:
      'Automated GST computation on restaurant services with monthly GSTR-8 returns synthesis.',
  },
  {
    id: 'CHK_LABOR_006',
    domain: 'GIG_WORKFORCE_LABOR',
    title: 'Delivery Partner Accidental Cover & 100% Tips Direct Pass-Through',
    statutoryReference: 'Code on Social Security 2020, Chapter IX (Gig and Platform Workers)',
    status: 'COMPLIANT',
    verifiedAt: '2026-11-14T09:00:00.000Z',
    notes:
      'Group accidental disability cover active per delivery shift; zero fee commission deducted from customer tips.',
  },
  {
    id: 'CHK_INSPECT_007',
    domain: 'INSPECTOR_ACCREDITATION',
    title: 'Auditor Hygiene Certification & Digital Tamper-Proof Audit Trails',
    statutoryReference: 'FSSAI Food Safety Audit Regulations 2018 & NABL ISO/IEC 17020 Guidelines',
    status: 'COMPLIANT',
    verifiedAt: '2026-11-14T09:00:00.000Z',
    notes:
      'Field food safety inspectors trained on calibrated 100-point hygiene rubric with immutable audit trails.',
  },
];

export class InMemoryComplianceStore implements ComplianceStore {
  private signOffs = new Map<string, AdviserSignOff>();
  private checkItems = new Map<string, ComplianceCheckItem>();

  constructor() {
    for (const item of INITIAL_CHECK_ITEMS) {
      this.checkItems.set(item.id, { ...item });
    }
  }

  async saveSignOff(signOff: AdviserSignOff): Promise<AdviserSignOff> {
    const clone = { ...signOff };
    this.signOffs.set(clone.id, clone);
    return clone;
  }

  async listSignOffs(): Promise<AdviserSignOff[]> {
    return Array.from(this.signOffs.values());
  }

  async getSignOffByDomain(domain: ComplianceDomain): Promise<AdviserSignOff | null> {
    for (const signOff of this.signOffs.values()) {
      if (signOff.domain === domain) {
        return { ...signOff };
      }
    }
    return null;
  }

  async listCheckItems(): Promise<ComplianceCheckItem[]> {
    return Array.from(this.checkItems.values());
  }

  async updateCheckItemStatus(
    id: string,
    status: ComplianceItemStatus,
    notes?: string,
  ): Promise<ComplianceCheckItem | null> {
    const existing = this.checkItems.get(id);
    if (!existing) return null;
    const updated: ComplianceCheckItem = {
      ...existing,
      status,
      verifiedAt: new Date().toISOString(),
      ...(notes ? { notes } : {}),
    };
    this.checkItems.set(id, updated);
    return updated;
  }
}

interface AdviserSignOffDoc extends Document {
  signOffId: string;
  domain: string;
  adviserName: string;
  professionalRegistrationNo: string;
  firmOrAgency: string;
  status: string;
  signedAt: Date;
  expiresAt: Date;
  remarks: string;
  auditChecksum: string;
}

const AdviserSignOffSchema = new Schema<AdviserSignOffDoc>(
  {
    signOffId: { type: String, required: true, unique: true },
    domain: { type: String, required: true },
    adviserName: { type: String, required: true },
    professionalRegistrationNo: { type: String, required: true },
    firmOrAgency: { type: String, required: true },
    status: { type: String, required: true },
    signedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    remarks: { type: String, required: true },
    auditChecksum: { type: String, required: true },
  },
  { timestamps: true },
);

export class MongooseComplianceStore implements ComplianceStore {
  private fallback = new InMemoryComplianceStore();
  private model: Model<AdviserSignOffDoc>;

  constructor() {
    this.model =
      (mongoose.models.AdviserSignOff as Model<AdviserSignOffDoc>) ||
      mongoose.model<AdviserSignOffDoc>('AdviserSignOff', AdviserSignOffSchema);
  }

  private isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }

  async saveSignOff(signOff: AdviserSignOff): Promise<AdviserSignOff> {
    if (!this.isConnected()) {
      return this.fallback.saveSignOff(signOff);
    }
    await this.model.findOneAndUpdate(
      { signOffId: signOff.id },
      {
        signOffId: signOff.id,
        domain: signOff.domain,
        adviserName: signOff.adviserName,
        professionalRegistrationNo: signOff.professionalRegistrationNo,
        firmOrAgency: signOff.firmOrAgency,
        status: signOff.status,
        signedAt: new Date(signOff.signedAt),
        expiresAt: new Date(signOff.expiresAt),
        remarks: signOff.remarks,
        auditChecksum: signOff.auditChecksum,
      },
      { upsert: true, new: true },
    );
    return signOff;
  }

  async listSignOffs(): Promise<AdviserSignOff[]> {
    if (!this.isConnected()) {
      return this.fallback.listSignOffs();
    }
    const docs = await this.model.find({}).sort({ signedAt: -1 }).lean();
    return docs.map((doc) => ({
      id: doc.signOffId,
      domain: doc.domain as ComplianceDomain,
      adviserName: doc.adviserName,
      professionalRegistrationNo: doc.professionalRegistrationNo,
      firmOrAgency: doc.firmOrAgency,
      status: doc.status as AdviserSignOff['status'],
      signedAt: doc.signedAt.toISOString(),
      expiresAt: doc.expiresAt.toISOString(),
      remarks: doc.remarks,
      auditChecksum: doc.auditChecksum,
    }));
  }

  async getSignOffByDomain(domain: ComplianceDomain): Promise<AdviserSignOff | null> {
    if (!this.isConnected()) {
      return this.fallback.getSignOffByDomain(domain);
    }
    const doc = await this.model.findOne({ domain }).lean();
    if (!doc) return null;
    return {
      id: doc.signOffId,
      domain: doc.domain as ComplianceDomain,
      adviserName: doc.adviserName,
      professionalRegistrationNo: doc.professionalRegistrationNo,
      firmOrAgency: doc.firmOrAgency,
      status: doc.status as AdviserSignOff['status'],
      signedAt: doc.signedAt.toISOString(),
      expiresAt: doc.expiresAt.toISOString(),
      remarks: doc.remarks,
      auditChecksum: doc.auditChecksum,
    };
  }

  async listCheckItems(): Promise<ComplianceCheckItem[]> {
    return this.fallback.listCheckItems();
  }

  async updateCheckItemStatus(
    id: string,
    status: ComplianceItemStatus,
    notes?: string,
  ): Promise<ComplianceCheckItem | null> {
    return this.fallback.updateCheckItemStatus(id, status, notes);
  }
}
