type MockRow = Record<string, unknown>;

type MockError = {
  message: string;
};

type MockResult<TData> = {
  data: TData | null;
  error: MockError | null;
};

type Predicate =
  | {
      column: string;
      operator: "eq";
      value: unknown;
    }
  | {
      column: string;
      operator: "gt";
      value: unknown;
    };

type FailureOptions = {
  error?: MockError | string;
  throw?: boolean;
};

type PendingFailure = {
  error: MockError;
  shouldThrow: boolean;
};

type RowFailure = {
  table: string;
  primaryKeyValue: unknown;
  error: MockError;
};

type InitialState = Map<string, MockRow[]> | Record<string, MockRow[]>;

const primaryKeyFor = (table: string) => (table === "profiles" ? "user_id" : "id");

const toError = (error?: MockError | string): MockError =>
  typeof error === "string" ? { message: error } : error ?? { message: "Mock Supabase failure" };

const cloneRows = (rows: MockRow[]) => rows.map((row) => ({ ...row }));

const compareValues = (left: unknown, right: unknown) => {
  if (typeof left === "number" && typeof right === "number") {
    return left > right;
  }

  return String(left) > String(right);
};

export function createMockSupabase(initialState: InitialState = {}) {
  const store = new Map<string, MockRow[]>(
    (initialState instanceof Map
      ? [...initialState.entries()]
      : Object.entries(initialState)
    ).map(([table, rows]) => [table, cloneRows(rows)]),
  );

  let nextFailure: PendingFailure | null = null;
  const tableFailures = new Map<string, PendingFailure>();
  const rowFailures: RowFailure[] = [];
  let authUserId = "mock-user-id";
  let authError: MockError | null = null;
  // When true, every request throws — simulates being offline. Toggle to test backoff.
  let networkDown = false;
  // Storage: bucket -> path -> stored object. Plus a one-shot failure for upload/sign.
  const storageStore = new Map<string, Map<string, { blob: unknown; contentType?: string }>>();
  let nextStorageFailure: PendingFailure | null = null;
  let signedUrlCallCount = 0;
  // Counts getUser() calls — one per push/pull cycle, so tests can count sync attempts.
  let authCallCount = 0;

  const throwIfNetworkDown = () => {
    if (networkDown) {
      throw toError("Simulated network failure.");
    }
  };

  const makeFailure = (options?: FailureOptions): PendingFailure => ({
    error: toError(options?.error),
    shouldThrow: options?.throw ?? false,
  });

  const fail = async <TData>(failure: PendingFailure): Promise<MockResult<TData>> => {
    if (failure.shouldThrow) {
      throw failure.error;
    }

    return { data: null, error: failure.error };
  };

  const consumeFailure = (table?: string) => {
    if (nextFailure) {
      const failure = nextFailure;
      nextFailure = null;
      return failure;
    }

    if (!table) {
      return null;
    }

    const failure = tableFailures.get(table);

    if (failure) {
      tableFailures.delete(table);
    }

    return failure ?? null;
  };

  const applyPredicates = (rows: MockRow[], predicates: Predicate[]) =>
    rows.filter((row) =>
      predicates.every((predicate) => {
        const value = row[predicate.column];

        if (predicate.operator === "eq") {
          return value === predicate.value;
        }

        return value !== undefined && compareValues(value, predicate.value);
      }),
    );

  const upsertRows = (table: string, rows: MockRow | MockRow[]) => {
    const rowList = Array.isArray(rows) ? rows : [rows];
    const primaryKey = primaryKeyFor(table);
    const existingRows = store.get(table) ?? [];
    const nextRows = [...existingRows];
    const successfulRows: MockRow[] = [];
    const failedRowIndexes: number[] = [];
    const rowFailureErrors: MockError[] = [];

    for (const row of rowList) {
      // A row failure persists (models a constraint violation): the row keeps failing on
      // both the batch upsert and push.ts's per-row retry, so it gets quarantined rather
      // than silently succeeding on the retry.
      const failureIndex = rowFailures.findIndex(
        (failure) =>
          failure.table === table && row[primaryKey] === failure.primaryKeyValue,
      );

      if (failureIndex >= 0) {
        failedRowIndexes.push(failureIndex);
        rowFailureErrors.push(rowFailures[failureIndex].error);
        continue;
      }

      const rowPrimaryKey = row[primaryKey];
      const existingIndex = nextRows.findIndex(
        (existingRow) => existingRow[primaryKey] === rowPrimaryKey,
      );
      const clonedRow = { ...row };

      if (existingIndex >= 0) {
        nextRows[existingIndex] = clonedRow;
      } else {
        nextRows.push(clonedRow);
      }

      successfulRows.push(clonedRow);
    }

    store.set(table, nextRows);

    return {
      data: successfulRows,
      error:
        failedRowIndexes.length > 0
          ? rowFailureErrors[0]
          : null,
    };
  };

  const createQueryBuilder = (table: string) => {
    const predicates: Predicate[] = [];
    let orderSpec: { column: string; ascending: boolean } | null = null;

    const builder = {
      select(_columns?: string) {
        void _columns;
        return builder;
      },
      gt(column: string, value: unknown) {
        predicates.push({ column, operator: "gt", value });
        return builder;
      },
      eq(column: string, value: unknown) {
        predicates.push({ column, operator: "eq", value });
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderSpec = { column, ascending: options?.ascending ?? true };
        return builder;
      },
      async upsert(rows: MockRow | MockRow[]) {
        throwIfNetworkDown();

        const failure = consumeFailure(table);

        if (failure) {
          return fail<MockRow[]>(failure);
        }

        return upsertRows(table, rows);
      },
      then<TResult1 = MockResult<MockRow[]>, TResult2 = never>(
        onfulfilled?:
          | ((value: MockResult<MockRow[]>) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        const query = async () => {
          throwIfNetworkDown();

          const failure = consumeFailure(table);

          if (failure) {
            return fail<MockRow[]>(failure);
          }

          const rows = cloneRows(applyPredicates(store.get(table) ?? [], predicates));

          if (orderSpec) {
            const { column, ascending } = orderSpec;
            rows.sort((a, b) => {
              const left = a[column];
              const right = b[column];
              const cmp = compareValues(left, right) ? 1 : compareValues(right, left) ? -1 : 0;
              return ascending ? cmp : -cmp;
            });
          }

          return { data: rows, error: null };
        };

        return query().then(onfulfilled, onrejected);
      },
    };

    return builder;
  };

  const consumeStorageFailure = () => {
    if (nextStorageFailure) {
      const failure = nextStorageFailure;
      nextStorageFailure = null;
      return failure;
    }
    return null;
  };

  const storage = {
    from(bucket: string) {
      const signOne = (path: string) =>
        `https://mock.storage/${bucket}/${path}?token=signed`;

      return {
        async upload(path: string, blob: unknown, options?: { contentType?: string }) {
          throwIfNetworkDown();
          const failure = consumeStorageFailure();
          if (failure) return fail<{ path: string }>(failure);

          const bucketMap = storageStore.get(bucket) ?? new Map();
          bucketMap.set(path, { blob, contentType: options?.contentType });
          storageStore.set(bucket, bucketMap);
          return { data: { path }, error: null };
        },
        async createSignedUrl(path: string, _expiresIn: number) {
          void _expiresIn;
          signedUrlCallCount += 1;
          throwIfNetworkDown();
          const failure = consumeStorageFailure();
          if (failure) return fail<{ signedUrl: string }>(failure);
          return { data: { signedUrl: signOne(path) }, error: null };
        },
        async createSignedUrls(paths: string[], _expiresIn: number) {
          void _expiresIn;
          signedUrlCallCount += 1;
          throwIfNetworkDown();
          const failure = consumeStorageFailure();
          if (failure) {
            return fail<Array<{ path: string; signedUrl: string; error: null }>>(failure);
          }
          return {
            data: paths.map((path) => ({ path, signedUrl: signOne(path), error: null })),
            error: null,
          };
        },
      };
    },
  };

  const client = {
    from(table: string) {
      return createQueryBuilder(table);
    },
    storage,
    auth: {
      async getUser() {
        authCallCount += 1;
        throwIfNetworkDown();

        const failure = consumeFailure();

        if (failure) {
          return fail<{ user: { id: string } }>(failure);
        }

        if (authError) {
          return { data: { user: null }, error: authError };
        }

        return { data: { user: { id: authUserId } }, error: null };
      },
      // getSession reads local session state (no network) — used by ingest.
      async getSession() {
        if (authError) {
          return { data: { session: null }, error: authError };
        }
        return {
          data: { session: { user: { id: authUserId } } },
          error: null,
        };
      },
    },
  };

  return {
    client,
    store,
    failNext(options?: FailureOptions) {
      nextFailure = makeFailure(options);
    },
    failTable(table: string, options?: FailureOptions) {
      tableFailures.set(table, makeFailure(options));
    },
    failRow(table: string, primaryKeyValue: unknown, error?: MockError | string) {
      rowFailures.push({
        table,
        primaryKeyValue,
        error: toError(error),
      });
    },
    setAuthUserId(userId: string) {
      authUserId = userId;
    },
    setAuthError(error: MockError | string | null) {
      authError = error === null ? null : toError(error);
    },
    setNetworkDown(down: boolean) {
      networkDown = down;
    },
    getAuthCallCount() {
      return authCallCount;
    },
    // Storage controls: one-shot failure + inspection of uploaded objects.
    failStorageNext(options?: FailureOptions) {
      nextStorageFailure = makeFailure(options);
    },
    getStorageObject(bucket: string, path: string) {
      return storageStore.get(bucket)?.get(path);
    },
    getStorageBucket(bucket: string) {
      return storageStore.get(bucket);
    },
    getSignedUrlCallCount() {
      return signedUrlCallCount;
    },
  };
}
