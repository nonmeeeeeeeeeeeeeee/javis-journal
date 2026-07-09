export type ImageBlobRow = {
  id: string;
  original: Blob | null;
  main: Blob;
  thumb: Blob;
  kind: "photo" | "sticker";
  createdAt: number;
};
