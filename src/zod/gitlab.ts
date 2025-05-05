/** @format */

import { z } from "zod";

export const GitLabFileContentSchema = z.object({
  file_name: z.string(),
  file_path: z.string(),
  size: z.number(),
  encoding: z.string(),
  content: z.string(),
  content_sha256: z.string(),
  ref: z.string(),
  blob_id: z.string(),
  commit_id: z.string(),
  last_commit_id: z.string(),
  execute_filemode: z.boolean().optional(),
});

export type GitLabContent = z.infer<typeof GitLabFileContentSchema>;

// Define the schema for a single MemoItem stored in GitLab
export const MemoItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  command: z.string(),
  timestamp: z.number(),
  alias: z.string().optional(),
  category: z.string(),
  // Note: isCloud is typically added locally after fetching, not stored in GitLab
});

// Define the schema for the overall data structure fetched from GitLab
export const GitLabDataSchema = z.object({
  commands: z.array(MemoItemSchema),
  // Potentially include categories if they are also synced
  // categories: z.array(z.string()).optional(),
});

// Infer the TypeScript type from the schema
export type GitLabData = z.infer<typeof GitLabDataSchema>;
