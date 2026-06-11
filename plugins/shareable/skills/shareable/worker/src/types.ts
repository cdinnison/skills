export interface Env {
  R2: R2Bucket;
  KV: KVNamespace;
  ASSETS: Fetcher;
  UPLOAD_TOKEN: string;
}

export type Version = {
  v: number;
  uploadedAt: number;
  size: number;
};

export type Range = {
  xpath: { start: string; end: string };
  offsets: { start: number; end: number };
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
};

export type ThreadEntry = {
  id: string;
  author: string;
  body: string;
  createdAt: number;
};

export type Comment = {
  id: string;
  version: number;
  range: Range;
  thread: ThreadEntry[];
  resolved: boolean;
  createdAt: number;
};

export type UploadResponse = {
  slug: string;
  version: number;
  url: string;
};
