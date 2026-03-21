// r2.ts
//
// API wrappers for the Cloudflare R2 zero-touch commands.
// All requests are proxied via Tauri to use the Wrangler OAuth token seamlessly.

import { invokeCloudflare } from "@/hooks/useCloudflare";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface R2Bucket {
  name: string;
  creation_date: string;
  object_count?: number;
  total_size_bytes?: number;
}

export interface R2Object {
  key: string;
  size: number;
  uploaded: string;
  etag: string;
}

export interface FolderListing {
  files: R2Object[];
  folders: string[];
}

export interface BucketDomainsInfo {
  managed: any;
  custom: any[];
}

// ── R2 Operations ──────────────────────────────────────────────────────────────

export async function createR2Bucket(bucketName: string): Promise<void> {
  return invokeCloudflare<void>("create_r2_bucket", { bucketName });
}

export async function deleteR2Bucket(bucketName: string): Promise<void> {
  return invokeCloudflare<void>("delete_r2_bucket", { bucketName });
}

export async function emptyR2Bucket(bucketName: string): Promise<void> {
  return invokeCloudflare<void>("empty_r2_bucket", { bucketName });
}

/**
 * Fetch all buckets for the authenticated Cloudflare account.
 */
export async function fetchR2Buckets(): Promise<R2Bucket[]> {
  return invokeCloudflare<R2Bucket[]>("fetch_r2_buckets");
}

/**
 * List files and folders in a specific bucket under a given prefix.
 * @param bucketName - The R2 bucket name
 * @param prefix - Folder prefix ending with "/", e.g. "projects/". Empty string for root.
 */
export async function listR2Objects(
  bucketName: string,
  prefix: string
): Promise<FolderListing> {
  return invokeCloudflare<FolderListing>("list_r2_objects", { bucketName, prefix });
}

/**
 * Upload a local file to R2 directly.
 * @param bucketName - The target R2 bucket name.
 * @param key - The destination key (e.g. "uploads/photo.jpg").
 * @param localPath - The absolute path of the local file to upload.
 */
export async function uploadR2Object(
  bucketName: string,
  key: string,
  localPath: string,
  uploadId: string
): Promise<void> {
  return invokeCloudflare<void>("upload_r2_object", { bucketName, key, localPath, uploadId });
}

/**
 * Cancel an ongoing upload process.
 */
export async function cancelUploadR2Object(
  uploadId: string,
  bucketName: string,
  key: string
): Promise<void> {
  return invokeCloudflare<void>("cancel_upload_r2_object", { uploadId, bucketName, key });
}

/**
 * Delete an object from R2.
 */
export async function deleteR2Object(
  bucketName: string,
  key: string
): Promise<void> {
  return invokeCloudflare<void>("delete_r2_object", { bucketName, key });
}

/**
 * Download an object from R2 to the local filesystem.
 * @param bucketName - The source R2 bucket name.
 * @param key - The source R2 key.
 * @param destinationPath - The absolute path to save the file locally.
 */
export async function downloadR2Object(
  bucketName: string,
  key: string,
  destinationPath: string
): Promise<void> {
  return invokeCloudflare<void>("download_r2_object", {
    bucketName,
    key,
    destinationPath,
  });
}

/**
 * Retrieves the public domain of an R2 bucket.
 * Returns the custom domain or managed domain formatted dynamically, or null if private.
 */
export async function getR2BucketDomain(bucketName: string): Promise<string | null> {
  return invokeCloudflare<string | null>("get_r2_bucket_domain", { bucketName });
}

export async function getR2BucketDomainsList(bucketName: string): Promise<BucketDomainsInfo> {
  return invokeCloudflare<BucketDomainsInfo>("get_r2_bucket_domains_list", { bucketName });
}

export async function updateR2BucketManagedDomain(bucketName: string, enabled: boolean): Promise<void> {
  return invokeCloudflare<void>("update_r2_bucket_managed_domain", { bucketName, enabled });
}

export async function addR2BucketCustomDomain(bucketName: string, domain: string, zoneId: string): Promise<void> {
  return invokeCloudflare<void>("add_r2_bucket_custom_domain", { bucketName, domain, zoneId });
}

export async function removeR2BucketCustomDomain(bucketName: string, domain: string): Promise<void> {
  return invokeCloudflare<void>("remove_r2_bucket_custom_domain", { bucketName, domain });
}
