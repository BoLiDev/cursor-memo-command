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
