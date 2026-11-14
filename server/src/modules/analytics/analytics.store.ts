import { Schema, type Connection, type Model } from 'mongoose';
import type {
  ComplaintAnalyticsRecord,
  InspectionAnalyticsRecord,
  OrderAnalyticsRecord,
} from './analytics.types';

export interface AnalyticsFilter {
  startDate?: Date;
  endDate?: Date;
  outletId?: string;
  zoneId?: string;
}

export interface AnalyticsStore {
  recordOrder(record: OrderAnalyticsRecord): Promise<void>;
  queryOrders(filter?: AnalyticsFilter): Promise<OrderAnalyticsRecord[]>;
  recordInspection(record: InspectionAnalyticsRecord): Promise<void>;
  queryInspections(filter?: AnalyticsFilter): Promise<InspectionAnalyticsRecord[]>;
  recordComplaint(record: ComplaintAnalyticsRecord): Promise<void>;
  queryComplaints(filter?: AnalyticsFilter): Promise<ComplaintAnalyticsRecord[]>;
  seedSampleData(
    orders: OrderAnalyticsRecord[],
    inspections: InspectionAnalyticsRecord[],
    complaints: ComplaintAnalyticsRecord[],
  ): Promise<void>;
}

export class InMemoryAnalyticsStore implements AnalyticsStore {
  private orders: OrderAnalyticsRecord[] = [];
  private inspections: InspectionAnalyticsRecord[] = [];
  private complaints: ComplaintAnalyticsRecord[] = [];

  async recordOrder(record: OrderAnalyticsRecord): Promise<void> {
    const existingIndex = this.orders.findIndex((o) => o.orderId === record.orderId);
    if (existingIndex >= 0) {
      this.orders[existingIndex] = record;
    } else {
      this.orders.push(record);
    }
  }

  async queryOrders(filter?: AnalyticsFilter): Promise<OrderAnalyticsRecord[]> {
    return this.orders.filter((order) => {
      if (filter?.outletId && order.outletId !== filter.outletId) {
        return false;
      }
      if (filter?.zoneId && order.zoneId !== filter.zoneId) {
        return false;
      }
      if (filter?.startDate && order.createdAt < filter.startDate) {
        return false;
      }
      if (filter?.endDate && order.createdAt > filter.endDate) {
        return false;
      }
      return true;
    });
  }

  async recordInspection(record: InspectionAnalyticsRecord): Promise<void> {
    const idx = this.inspections.findIndex((i) => i.inspectionId === record.inspectionId);
    if (idx >= 0) {
      this.inspections[idx] = record;
    } else {
      this.inspections.push(record);
    }
  }

  async queryInspections(filter?: AnalyticsFilter): Promise<InspectionAnalyticsRecord[]> {
    return this.inspections.filter((insp) => {
      if (filter?.outletId && insp.outletId !== filter.outletId) {
        return false;
      }
      if (filter?.startDate && insp.conductedAt < filter.startDate) {
        return false;
      }
      if (filter?.endDate && insp.conductedAt > filter.endDate) {
        return false;
      }
      return true;
    });
  }

  async recordComplaint(record: ComplaintAnalyticsRecord): Promise<void> {
    const idx = this.complaints.findIndex((c) => c.complaintId === record.complaintId);
    if (idx >= 0) {
      this.complaints[idx] = record;
    } else {
      this.complaints.push(record);
    }
  }

  async queryComplaints(filter?: AnalyticsFilter): Promise<ComplaintAnalyticsRecord[]> {
    return this.complaints.filter((comp) => {
      if (filter?.outletId && comp.outletId !== filter.outletId) {
        return false;
      }
      if (filter?.startDate && comp.createdAt < filter.startDate) {
        return false;
      }
      if (filter?.endDate && comp.createdAt > filter.endDate) {
        return false;
      }
      return true;
    });
  }

  async seedSampleData(
    orders: OrderAnalyticsRecord[],
    inspections: InspectionAnalyticsRecord[],
    complaints: ComplaintAnalyticsRecord[],
  ): Promise<void> {
    this.orders = [...orders];
    this.inspections = [...inspections];
    this.complaints = [...complaints];
  }
}

const OrderAnalyticsSchema = new Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    deliveryAddress: { type: String, required: true },
    outletId: { type: String, required: true, index: true },
    outletName: { type: String, required: true },
    zoneId: { type: String, required: true, index: true },
    zoneName: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'PREPARING', 'READY', 'DISPATCHED', 'DELIVERED', 'CANCELLED'],
      index: true,
    },
    subtotalPaise: { type: Number, required: true },
    deliveryFeePaise: { type: Number, required: true },
    taxesPaise: { type: Number, required: true },
    platformFeePaise: { type: Number, required: true },
    discountPaise: { type: Number, required: true },
    totalPaise: { type: Number, required: true },
    items: [
      {
        itemId: { type: String, required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        pricePaise: { type: Number, required: true },
      },
    ],
    prepDurationMinutes: { type: Number },
    deliveryDurationMinutes: { type: Number },
    isOnTime: { type: Boolean },
    createdAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, collection: 'analytics_orders' },
);

const InspectionAnalyticsSchema = new Schema(
  {
    inspectionId: { type: String, required: true, unique: true, index: true },
    outletId: { type: String, required: true, index: true },
    outletName: { type: String, required: true },
    score: { type: Number, required: true },
    criticalViolationsCount: { type: Number, required: true },
    status: { type: String, required: true, enum: ['PASSED', 'FAILED', 'SUSPENDED'] },
    conductedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, collection: 'analytics_inspections' },
);

const ComplaintAnalyticsSchema = new Schema(
  {
    complaintId: { type: String, required: true, unique: true, index: true },
    outletId: { type: String, required: true, index: true },
    outletName: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: ['HYGIENE', 'FOREIGN_OBJECT', 'TASTE', 'PACKAGING', 'DELIVERY'],
    },
    severity: { type: String, required: true, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    status: { type: String, required: true, enum: ['RESOLVED', 'INVESTIGATING', 'ESCALATED'] },
    resolutionHours: { type: Number, required: true },
    createdAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, collection: 'analytics_complaints' },
);

type OrderAnalyticsDocument = OrderAnalyticsRecord & { _id?: unknown };
type InspectionAnalyticsDocument = InspectionAnalyticsRecord & { _id?: unknown };
type ComplaintAnalyticsDocument = ComplaintAnalyticsRecord & { _id?: unknown };

export class MongooseAnalyticsStore implements AnalyticsStore {
  private readonly orderModel: Model<OrderAnalyticsDocument>;
  private readonly inspectionModel: Model<InspectionAnalyticsDocument>;
  private readonly complaintModel: Model<ComplaintAnalyticsDocument>;

  constructor(connection: Connection) {
    this.orderModel =
      (connection.models['AnalyticsOrder'] as Model<OrderAnalyticsDocument> | undefined) ??
      connection.model<OrderAnalyticsDocument>('AnalyticsOrder', OrderAnalyticsSchema);
    this.inspectionModel =
      (connection.models['AnalyticsInspection'] as
        | Model<InspectionAnalyticsDocument>
        | undefined) ??
      connection.model<InspectionAnalyticsDocument>(
        'AnalyticsInspection',
        InspectionAnalyticsSchema,
      );
    this.complaintModel =
      (connection.models['AnalyticsComplaint'] as
        | Model<ComplaintAnalyticsDocument>
        | undefined) ??
      connection.model<ComplaintAnalyticsDocument>('AnalyticsComplaint', ComplaintAnalyticsSchema);
  }

  async recordOrder(record: OrderAnalyticsRecord): Promise<void> {
    await this.orderModel.findOneAndUpdate({ orderId: record.orderId }, record, {
      upsert: true,
      new: true,
    });
  }

  async queryOrders(filter?: AnalyticsFilter): Promise<OrderAnalyticsRecord[]> {
    const query: Record<string, unknown> = {};
    if (filter?.outletId) query['outletId'] = filter.outletId;
    if (filter?.zoneId) query['zoneId'] = filter.zoneId;
    if (filter?.startDate || filter?.endDate) {
      const dateRange: Record<string, unknown> = {};
      if (filter.startDate) dateRange['$gte'] = filter.startDate;
      if (filter.endDate) dateRange['$lte'] = filter.endDate;
      query['createdAt'] = dateRange;
    }
    const docs = await this.orderModel.find(query).lean<OrderAnalyticsDocument[]>().exec();
    return docs.map((doc) => ({
      orderId: doc.orderId,
      customerId: doc.customerId,
      customerName: doc.customerName,
      customerPhone: doc.customerPhone,
      deliveryAddress: doc.deliveryAddress,
      outletId: doc.outletId,
      outletName: doc.outletName,
      zoneId: doc.zoneId,
      zoneName: doc.zoneName,
      status: doc.status,
      subtotalPaise: doc.subtotalPaise,
      deliveryFeePaise: doc.deliveryFeePaise,
      taxesPaise: doc.taxesPaise,
      platformFeePaise: doc.platformFeePaise,
      discountPaise: doc.discountPaise,
      totalPaise: doc.totalPaise,
      items: doc.items || [],
      prepDurationMinutes: doc.prepDurationMinutes,
      deliveryDurationMinutes: doc.deliveryDurationMinutes,
      isOnTime: doc.isOnTime,
      createdAt: new Date(doc.createdAt),
    }));
  }

  async recordInspection(record: InspectionAnalyticsRecord): Promise<void> {
    await this.inspectionModel.findOneAndUpdate({ inspectionId: record.inspectionId }, record, {
      upsert: true,
      new: true,
    });
  }

  async queryInspections(filter?: AnalyticsFilter): Promise<InspectionAnalyticsRecord[]> {
    const query: Record<string, unknown> = {};
    if (filter?.outletId) query['outletId'] = filter.outletId;
    if (filter?.startDate || filter?.endDate) {
      const dateRange: Record<string, unknown> = {};
      if (filter.startDate) dateRange['$gte'] = filter.startDate;
      if (filter.endDate) dateRange['$lte'] = filter.endDate;
      query['conductedAt'] = dateRange;
    }
    const docs = await this.inspectionModel
      .find(query)
      .lean<InspectionAnalyticsDocument[]>()
      .exec();
    return docs.map((doc) => ({
      inspectionId: doc.inspectionId,
      outletId: doc.outletId,
      outletName: doc.outletName,
      score: doc.score,
      criticalViolationsCount: doc.criticalViolationsCount,
      status: doc.status,
      conductedAt: new Date(doc.conductedAt),
    }));
  }

  async recordComplaint(record: ComplaintAnalyticsRecord): Promise<void> {
    await this.complaintModel.findOneAndUpdate({ complaintId: record.complaintId }, record, {
      upsert: true,
      new: true,
    });
  }

  async queryComplaints(filter?: AnalyticsFilter): Promise<ComplaintAnalyticsRecord[]> {
    const query: Record<string, unknown> = {};
    if (filter?.outletId) query['outletId'] = filter.outletId;
    if (filter?.startDate || filter?.endDate) {
      const dateRange: Record<string, unknown> = {};
      if (filter.startDate) dateRange['$gte'] = filter.startDate;
      if (filter.endDate) dateRange['$lte'] = filter.endDate;
      query['createdAt'] = dateRange;
    }
    const docs = await this.complaintModel.find(query).lean<ComplaintAnalyticsDocument[]>().exec();
    return docs.map((doc) => ({
      complaintId: doc.complaintId,
      outletId: doc.outletId,
      outletName: doc.outletName,
      category: doc.category,
      severity: doc.severity,
      status: doc.status,
      resolutionHours: doc.resolutionHours,
      createdAt: new Date(doc.createdAt),
    }));
  }

  async seedSampleData(
    orders: OrderAnalyticsRecord[],
    inspections: InspectionAnalyticsRecord[],
    complaints: ComplaintAnalyticsRecord[],
  ): Promise<void> {
    await this.orderModel.deleteMany({});
    await this.inspectionModel.deleteMany({});
    await this.complaintModel.deleteMany({});
    if (orders.length > 0) await this.orderModel.insertMany(orders);
    if (inspections.length > 0) await this.inspectionModel.insertMany(inspections);
    if (complaints.length > 0) await this.complaintModel.insertMany(complaints);
  }
}
