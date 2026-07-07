export type MaskType =
  | "postage"
  | "cloud"
  | "spiky"
  | "heart"
  | "circle"
  | "square"
  | "oval";

export type RotationDeg = 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;

export type SelectedFrame = "rse" | "hgss_15" | "hgss_18";

export type AllowedEmail = {
  email: string;
  note: string | null;
  added_at: string;
};

export type Profile = {
  user_id: string;
  start_of_week: number;
  selected_frame: SelectedFrame;
  fireworks_seen: boolean;
  created_at: string;
  updated_at: string;
};

export type ImageRow = {
  id: string;
  user_id: string;
  storage_path: string;
  thumb_path: string;
  width: number | null;
  height: number | null;
  mime: string;
  byte_size: number | null;
  created_at: string;
};

export type Entry = {
  id: string;
  user_id: string;
  entry_date: string;
  created_at: string;
  updated_at: string;
};

export type Stamp = {
  id: string;
  entry_id: string;
  user_id: string;
  image_id: string;
  mask_type: MaskType;
  crop_offset_x: number;
  crop_offset_y: number;
  crop_scale: number;
  pos_x: number;
  pos_y: number;
  scale: number;
  rotation_deg: RotationDeg;
  layer_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type StickerAsset = {
  id: string;
  user_id: string;
  image_id: string;
  is_seeded: boolean;
  created_at: string;
};

export type PlacedSticker = {
  id: string;
  user_id: string;
  image_id: string;
  sticker_asset_id: string | null;
  pos_x: number;
  pos_y: number;
  scale: number;
  rotation_deg: RotationDeg;
  layer_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
