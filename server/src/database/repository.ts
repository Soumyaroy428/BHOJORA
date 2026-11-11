import type { ClientSession, Connection, QueryFilter, UpdateQuery } from 'mongoose';

export interface CursorPage<TDoc> {
  items: TDoc[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface RepositoryModelContract<TDoc> {
  findById(
    id: string,
    projection?: unknown,
    options?: { session?: ClientSession },
  ): Promise<TDoc | null>;
  findOne(
    filter: QueryFilter<TDoc>,
    projection?: unknown,
    options?: { session?: ClientSession },
  ): Promise<TDoc | null>;
  create(docs: Partial<TDoc>[], options?: { session?: ClientSession }): Promise<TDoc[]>;
  findOneAndUpdate(
    filter: QueryFilter<TDoc>,
    update: UpdateQuery<TDoc>,
    options: { new: true; runValidators: true; session?: ClientSession },
  ): Promise<TDoc | null>;
  find(filter: QueryFilter<TDoc>): {
    sort(sortSpec: Record<string, 1 | -1>): {
      limit(limit: number): Promise<TDoc[]>;
    };
  };
}

export interface WithIdConstraint {
  _id?: unknown;
  id?: string;
}

/**
 * Shared generic repository encapsulation enforcing scoped data access and
 * atomic conditional state updates across modular monolith domains (ADR-002, ADR-006).
 */
export class BaseRepository<TDoc extends WithIdConstraint> {
  constructor(protected readonly model: RepositoryModelContract<TDoc>) {}

  async findById(id: string, session?: ClientSession): Promise<TDoc | null> {
    return this.model.findById(id, undefined, session ? { session } : undefined);
  }

  async findOne(filter: QueryFilter<TDoc>, session?: ClientSession): Promise<TDoc | null> {
    return this.model.findOne(filter, undefined, session ? { session } : undefined);
  }

  async create(payload: Partial<TDoc>, session?: ClientSession): Promise<TDoc> {
    const created = await this.model.create([payload], session ? { session } : undefined);
    const first = created[0];
    if (!first) {
      throw new Error('Repository create unexpectedly returned zero documents');
    }
    return first;
  }

  async atomicStateTransition(
    filter: QueryFilter<TDoc>,
    update: UpdateQuery<TDoc>,
    session?: ClientSession,
  ): Promise<TDoc | null> {
    return this.model.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
      ...(session ? { session } : {}),
    });
  }

  async findCursorPage(params: {
    filter: QueryFilter<TDoc>;
    limit: number;
    cursor?: string | null;
    sortDirection?: 1 | -1;
  }): Promise<CursorPage<TDoc>> {
    const boundedLimit = Math.min(Math.max(1, params.limit), 100);
    const direction = params.sortDirection ?? -1;
    const baseFilter: Record<string, unknown> = { ...(params.filter as Record<string, unknown>) };

    if (params.cursor) {
      baseFilter['_id'] = direction === -1 ? { $lt: params.cursor } : { $gt: params.cursor };
    }

    const rows = await this.model
      .find(baseFilter as QueryFilter<TDoc>)
      .sort({ _id: direction })
      .limit(boundedLimit + 1);

    const hasMore = rows.length > boundedLimit;
    const items = hasMore ? rows.slice(0, boundedLimit) : rows;
    const tail = items[items.length - 1];
    const nextCursor =
      hasMore && tail !== undefined ? String(tail.id ?? tail._id ?? '') || null : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }
}

export async function withTransaction<TResult>(
  connection: Pick<Connection, 'startSession'>,
  work: (session: ClientSession) => Promise<TResult>,
): Promise<TResult> {
  const session = await connection.startSession();
  try {
    return await session.withTransaction(async () => work(session));
  } finally {
    await session.endSession();
  }
}
