/** @format */

import fetch, { Response } from "node-fetch";
import { z } from "zod";
import {
  GitLabFileContentSchema,
  GitLabBranchResponseSchema,
  GitLabMergeRequestResponseSchema,
  GitLabFileCommitResponseSchema,
} from "../zod";
import { VscodeStorageService } from "./vscode-storage-service";
import { ConfigurationService } from "./configuration-service";

// Define a specific error type for API issues
export class GitlabApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "GitlabApiError";
  }
}

/**
 * Service dedicated to making raw API calls to GitLab.
 * Handles authentication and basic request/response processing.
 */
export class GitlabApiService {
  private static GITLAB_TOKEN_KEY = "cursor-memo-gitlab-token";

  constructor(
    private storageService: VscodeStorageService,
    private configService: ConfigurationService
  ) {}

  /**
   * Retrieves the GitLab token from storage.
   * Throws an error if the token is not found.
   */
  private async getRequiredToken(): Promise<string> {
    const token = await this.storageService.getSecret(
      GitlabApiService.GITLAB_TOKEN_KEY
    );
    if (!token) {
      throw new GitlabApiError("GitLab token not found in storage.", 401);
    }
    return token;
  }

  /**
   * Get file content from GitLab project.
   * @returns Promise resolving to the parsed file content metadata (including base64 content)
   */
  public async getFileContent(): Promise<
    z.infer<typeof GitLabFileContentSchema>
  > {
    const token = await this.getRequiredToken();
    const projectId = this.configService.getGitlabProjectId();
    const filePath = this.configService.getGitlabFilePath();
    const branch = this.configService.getGitlabBranch();
    const domain = this.configService.getGitlabDomain();

    if (!projectId || !filePath) {
      throw new GitlabApiError(
        "GitLab Project ID or File Path not configured.",
        400
      );
    }
    const encodedProjectId = encodeURIComponent(projectId);
    const encodedFilePath = encodeURIComponent(filePath);
    const encodedRef = encodeURIComponent(branch);

    const url = `${domain}/projects/${encodedProjectId}/repository/files/${encodedFilePath}?ref=${encodedRef}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "VSCode Cursor Memo Extension",
        },
        timeout: 15000,
      });

      await this.handleGitLabError(response);

      const fileData = await response.json();
      const validationResult = GitLabFileContentSchema.safeParse(fileData);
      if (!validationResult.success) {
        throw new GitlabApiError(
          `Invalid file metadata format from GitLab: ${validationResult.error.message}`,
          500
        );
      }
      return validationResult.data;
    } catch (error) {
      if (error instanceof GitlabApiError) throw error;
      throw new GitlabApiError(
        error instanceof Error ? error.message : "Unknown error fetching file",
        500
      );
    }
  }

  /**
   * Creates a new branch in the GitLab repository.
   * @param branchName Name of the new branch.
   * @param refBranch Source branch/ref to create from.
   */
  public async createBranch(
    branchName: string,
    refBranch?: string
  ): Promise<z.infer<typeof GitLabBranchResponseSchema>> {
    const token = await this.getRequiredToken();
    const projectId = this.configService.getGitlabProjectId();
    const domain = this.configService.getGitlabDomain();
    const defaultBranch = this.configService.getGitlabBranch();

    if (!projectId) {
      throw new GitlabApiError("GitLab Project ID not configured.", 400);
    }

    const encodedProjectId = encodeURIComponent(projectId);
    const url = `${domain}/projects/${encodedProjectId}/repository/branches`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "VSCode Cursor Memo Extension",
        },
        body: JSON.stringify({
          branch: branchName,
          ref: refBranch || defaultBranch,
        }),
      });

      await this.handleGitLabError(response);

      const data = await response.json();
      const validationResult = GitLabBranchResponseSchema.safeParse(data);

      if (!validationResult.success) {
        throw new GitlabApiError(
          "Invalid branch creation response format",
          500
        );
      }
      return validationResult.data;
    } catch (error: any) {
      if (error instanceof GitlabApiError) throw error;
      throw new GitlabApiError(
        error.message || "Unknown error creating branch",
        500
      );
    }
  }

  /**
   * Commits a file change (create or update) to a branch.
   * @param branchName Target branch name.
   * @param filePath Path to the file within the repository.
   * @param content Base64 encoded content of the file.
   * @param commitMessage Commit message.
   */
  public async commitFileChange(
    branchName: string,
    filePath: string,
    content: string,
    commitMessage: string
  ): Promise<z.infer<typeof GitLabFileCommitResponseSchema>> {
    const token = await this.getRequiredToken();
    const projectId = this.configService.getGitlabProjectId();
    const domain = this.configService.getGitlabDomain();

    if (!projectId || !filePath) {
      throw new GitlabApiError(
        "GitLab Project ID or File Path not configured.",
        400
      );
    }

    const encodedProjectId = encodeURIComponent(projectId);
    const encodedFilePath = encodeURIComponent(filePath);
    const url = `${domain}/projects/${encodedProjectId}/repository/files/${encodedFilePath}`;

    try {
      // Check if file exists to determine PUT vs POST
      let method = "POST";
      try {
        const checkResponse = await fetch(
          `${url}?ref=${encodeURIComponent(branchName)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "User-Agent": "VSCode Cursor Memo Extension",
            },
            timeout: 10000,
          }
        );
        if (checkResponse.ok) {
          method = "PUT";
        } else if (checkResponse.status !== 404) {
          await this.handleGitLabError(checkResponse);
        }
      } catch {
        method = "POST";
      }

      // Make the commit request
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "VSCode Cursor Memo Extension",
        },
        body: JSON.stringify({
          branch: branchName,
          content: content,
          encoding: "base64",
          commit_message: commitMessage,
        }),
      });

      await this.handleGitLabError(response);

      const data = await response.json();
      const validationResult = GitLabFileCommitResponseSchema.safeParse(data);

      if (!validationResult.success) {
        throw new GitlabApiError("Invalid file commit response format", 500);
      }
      return validationResult.data;
    } catch (error: any) {
      if (error instanceof GitlabApiError) throw error;
      throw new GitlabApiError(
        error.message || "Unknown error committing file",
        500
      );
    }
  }

  /**
   * Creates a merge request.
   * @param sourceBranch Source branch name.
   * @param targetBranch Target branch name.
   * @param title Merge request title.
   * @param description Merge request description.
   */
  public async createMergeRequest(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description: string
  ): Promise<z.infer<typeof GitLabMergeRequestResponseSchema>> {
    const token = await this.getRequiredToken();
    const projectId = this.configService.getGitlabProjectId();
    const domain = this.configService.getGitlabDomain();

    if (!projectId) {
      throw new GitlabApiError("GitLab Project ID not configured.", 400);
    }

    const encodedProjectId = encodeURIComponent(projectId);
    const url = `${domain}/projects/${encodedProjectId}/merge_requests`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "VSCode Cursor Memo Extension",
        },
        body: JSON.stringify({
          source_branch: sourceBranch,
          target_branch: targetBranch,
          title,
          description,
          remove_source_branch: true,
        }),
      });

      await this.handleGitLabError(response);

      const data = await response.json();
      const validationResult = GitLabMergeRequestResponseSchema.safeParse(data);

      if (!validationResult.success) {
        throw new GitlabApiError(
          "Invalid merge request creation response format",
          500
        );
      }
      return validationResult.data;
    } catch (error: any) {
      if (error instanceof GitlabApiError) throw error;
      throw new GitlabApiError(
        error.message || "Unknown error creating merge request",
        500
      );
    }
  }

  /**
   * Handles GitLab API errors by checking response status and throwing specific errors.
   */
  private async handleGitLabError(response: Response): Promise<void> {
    if (!response.ok) {
      const errorBody = await response.text();
      let message = `GitLab API error: ${response.status} ${response.statusText}.`;

      switch (response.status) {
        case 401:
          message =
            "GitLab API error: 401 Unauthorized. Check your Personal Access Token.";
          break;
        case 403:
          message = errorBody.includes("Rate limit exceeded")
            ? `GitLab API Rate Limit Exceeded: ${errorBody}`
            : `GitLab API error: 403 Forbidden. Check token permissions or project access. Details: ${errorBody}`;
          break;
        case 404:
          message = `GitLab API error: 404 Not Found. Check Project ID, File Path, and Branch/Ref. Details: ${errorBody}`;
          break;
        default:
          message += ` Details: ${errorBody}`;
      }
      throw new GitlabApiError(message, response.status);
    }
  }
}
