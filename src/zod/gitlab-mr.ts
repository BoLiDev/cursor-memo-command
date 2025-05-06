/** @format */

import { z } from "zod";

// GitLab 分支创建响应验证模式
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

// GitLab 合并请求响应验证模式
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

// GitLab 文件提交响应验证模式
export const GitLabFileCommitResponseSchema = z.object({
  file_path: z.string(),
  branch: z.string(),
});

// 类型导出
export type GitLabBranchResponse = z.infer<typeof GitLabBranchResponseSchema>;
export type GitLabMergeRequestResponse = z.infer<
  typeof GitLabMergeRequestResponseSchema
>;
export type GitLabFileCommitResponse = z.infer<
  typeof GitLabFileCommitResponseSchema
>;
