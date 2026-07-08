export type SyncOutboxRow = {
  id: string;
  table: string;
  rowId: string;
  op: "upsert" | "delete";
  attempts: number;
  quarantined: boolean;
  lastError: string | null;
  createdAt: number;
};

export type SyncMetaRow = {
  table: string;
  cursor: string | null;
};
