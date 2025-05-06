/** @format */

import { z } from "zod";
import { CommandsStructureSchema } from "./command-schema"; // Assuming command-schema.ts will be the final name

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

export const GitLabDataSchema = CommandsStructureSchema;

export const GitLabBranchResponseSchema = z.object({
  name: z.string(),
  commit: z.object({
    id: z.string(),
    short_id: z.string(),
    title: z.string(),
    created_at: z.string(),
    parent_ids: z.array(z.string()).optional(),
  }),
  merged: z.boolean(),
  protected: z.boolean(),
  developers_can_push: z.boolean(),
  developers_can_merge: z.boolean(),
  can_push: z.boolean(),
  default: z.boolean(),
  web_url: z.string(),
});

export const GitLabMergeRequestResponseSchema = z.object({
  id: z.number(),
  iid: z.number(),
  project_id: z.number(),
  title: z.string(),
  description: z.string(),
  state: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  target_branch: z.string(),
  source_branch: z.string(),
  web_url: z.string(),
  merge_status: z.string(),
});

export const GitLabFileCommitResponseSchema = z.object({
  file_path: z.string(),
  branch: z.string(),
});

export type GitLabContent = z.infer<typeof GitLabFileContentSchema>;
export type GitLabData = z.infer<typeof GitLabDataSchema>;
export type GitLabBranchResponse = z.infer<typeof GitLabBranchResponseSchema>;
export type GitLabMergeRequestResponse = z.infer<
  typeof GitLabMergeRequestResponseSchema
>;
export type GitLabFileCommitResponse = z.infer<
  typeof GitLabFileCommitResponseSchema
>;
