export type CategoryDto = {
  id: string;
  name: string;
  color: string;
  muted: boolean;
  _count?: { feeds: number; items: number };
};

export type BrandDto = {
  id: string;
  name: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  storageType: "LOCAL" | "S3";
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKeyId: string;
  s3SecretKey: string;
  s3PublicBaseUrl: string;
  introUrl: string;
  outroUrl: string;
  captionStyleId: string | null;
  _count?: { feeds: number; templates: number };
};

export type ItemMediaDto = {
  id: string;
  url: string;
  type: "IMAGE" | "VIDEO" | "AUDIO";
  mimeType: string;
  source: string;
};

export type FeedDto = {
  id: string;
  url: string;
  title: string;
  siteUrl: string;
  enabled: boolean;
  muted: boolean;
  categoryId: string;
  category: CategoryDto;
  brandId: string | null;
  brand: BrandDto | null;
  lastCheckedAt: string | null;
  lastError: string;
  errorCount: number;
  _count: { items: number };
};

export type NewsItemDto = {
  id: string;
  guid: string;
  link: string;
  title: string;
  summary: string;
  content: string;
  author: string;
  imageUrl: string;
  publishedAt: string;
  fetchedAt: string;
  readAt: string | null;
  feed: { id: string; title: string; url?: string; brandId?: string | null };
  category: { id: string; name: string; color: string };
  media?: ItemMediaDto[];
};

export type UserDto = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "EDITOR";
  createdAt: string;
};
