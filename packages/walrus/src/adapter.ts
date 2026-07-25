export type WalrusBlobStatus = "stored" | "not_found" | "unknown";

export type WalrusUploadResult = {
  blobId: string;
  size: number;
  storage: "mock" | "walrus";
};

export type WalrusStatusResult = {
  blobId: string;
  status: WalrusBlobStatus;
  raw?: unknown;
};

export type WalrusAdapter = {
  upload(bytes: Uint8Array): Promise<WalrusUploadResult>;
  download(blobId: string): Promise<Uint8Array>;
  status(blobId: string): Promise<WalrusStatusResult>;
};

export type WalrusAdapterMode = "mock" | "cli";
