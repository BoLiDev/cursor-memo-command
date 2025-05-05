/** @format */

import * as vscode from "vscode";
import fetch, { Response } from "node-fetch";
import { GitLabContent, GitLabFileContentSchema } from "./zod/gitlab";

/**
 * GitLab client class for handling GitLab API interactions
 */
export class GitlabClient {
  private static GITLAB_TOKEN_KEY = "cursor-memo-gitlab-token";
  private domain: string;
  private projectId: string;
  private filePath: string;
  private branch: string;

  /**
   * Constructor
   * @param context VSCode extension context for accessing secrets storage
   */
  constructor(private context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration("cursorMemo");
    this.projectId = config.get<string>("gitlabProjectId") || "9993";
    this.filePath = config.get<string>("gitlabFilePath") || "prompt.json";
    this.domain = normalizeGitLabDomain(
      config.get<string>("gitlabDomain") || "https://gitlab.okg.com"
    );
    this.branch = config.get<string>("gitlabBranch") || "master";
  }

  /**
   * Fetch data from GitLab
   * @param config GitLab configuration parameters
   * @returns Promise with fetched commands data
   */
  public async fetchTeamCommands(): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const token = await this.getToken();

      if (!token) {
        return {
          success: false,
          error: "GitLab Personal Access Token is required for synchronization",
        };
      }

      const fileData = await this.getFileContent(token);

      // Decode Base64 content before parsing as JSON
      const decodedContent = Buffer.from(fileData.content, "base64").toString(
        "utf-8"
      );

      try {
        const jsonData = JSON.parse(decodedContent);

        return {
          success: true,
          data: jsonData,
        };
      } catch (parseError) {
        console.error("Failed to parse JSON content:", parseError);
        return {
          success: false,
          error: "Invalid JSON content in GitLab file",
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get GitLab Personal Access Token from Secret Storage
   * If token doesn't exist, interactively ask the user to input it
   * @returns Promise with the token or undefined if user cancels
   */
  public async getToken(): Promise<string | undefined> {
    let token = await this.context.secrets.get(GitlabClient.GITLAB_TOKEN_KEY);

    if (!token) {
      const inputToken = await vscode.window.showInputBox({
        prompt: "Enter GitLab Personal Access Token",
        placeHolder: "Enter your GitLab token to sync team commands",
        password: true,
        ignoreFocusOut: true,
        title: "GitLab Authentication",
      });

      if (inputToken) {
        await this.context.secrets.store(
          GitlabClient.GITLAB_TOKEN_KEY,
          inputToken
        );
        token = inputToken;
      } else {
        return undefined;
      }
    }

    return token;
  }

  /**
   * Clear stored GitLab token
   * This can be called when token becomes invalid
   */
  public async clearToken(): Promise<void> {
    await this.context.secrets.delete(GitlabClient.GITLAB_TOKEN_KEY);
  }

  /**
   * Get file or directory content from GitLab project
   *
   * @param token - GitLab Personal Access Token
   * @param ref - Branch, tag or commit reference, defaults to project's default branch
   * @returns Promise with the file or directory content
   */
  private async getFileContent(token: string): Promise<GitLabContent> {
    const branch = encodeURIComponent(this.branch);
    const encodedProjectId = encodeURIComponent(this.projectId);
    const encodedFilePath = encodeURIComponent(this.filePath);
    const encodedRef = encodeURIComponent(branch);

    const url = `${this.domain}/projects/${encodedProjectId}/repository/files/${encodedFilePath}?ref=${encodedRef}`;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      await handleGitLabError(response);

      const fileData = await response.json();
      return GitLabFileContentSchema.parse(fileData);
    } catch (error) {
      throw error;
    }
  }
}

/**
 * Normalize GitLab API URL
 * @param url - Input GitLab API URL
 * @returns Normalized GitLab API URL with /api/v4 path
 */
function normalizeGitLabDomain(url?: string): string {
  if (!url) {
    return "https://gitlab.com/api/v4";
  }

  let normalizedUrl = url.endsWith("/") ? url.slice(0, -1) : url;

  if (
    !normalizedUrl.endsWith("/api/v4") &&
    !normalizedUrl.endsWith("/api/v4/")
  ) {
    normalizedUrl = `${normalizedUrl}/api/v4`;
  }

  return normalizedUrl;
}

/**
 * Handle GitLab API errors
 * @param response - Response from GitLab API
 * @throws Error if the response is not successful
 */
async function handleGitLabError(response: Response): Promise<void> {
  if (!response.ok) {
    const errorBody = await response.text();

    if (
      response.status === 403 &&
      errorBody.includes("User API Key Rate limit exceeded")
    ) {
      throw new Error(`GitLab API Rate Limit Exceeded: ${errorBody}`);
    } else {
      throw new Error(
        `GitLab API error: ${response.status} ${response.statusText}\n${errorBody}`
      );
    }
  }
}
