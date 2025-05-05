/** @format */

import * as vscode from "vscode";
import fetch, { Response } from "node-fetch"; // Use node-fetch and Response type
import { z } from "zod";
// Import necessary schemas
import { MemoItemSchema, GitLabFileContentSchema } from "../zod/gitlab";
import { MemoItem } from "../models/memo-item";

// Schema for the structure *inside* the decoded GitLab file content
const teamCommandsSchema = z.object({
  commands: z.array(MemoItemSchema),
  categories: z.array(z.string()).optional(),
});

/**
 * Service for interacting with GitLab API, including fetching and managing cloud commands.
 * Combines original fetch logic with cloud state management.
 */
export class GitlabClient {
  private static GITLAB_TOKEN_KEY = "cursor-memo-gitlab-token"; // Original key name
  private static CLOUD_COMMANDS_KEY = "cursor-memo-cloud-commands";
  private static DEFAULT_CATEGORY = "default";

  private domain: string;
  private projectId: string;
  private filePath: string;
  private branch: string;

  private cloudCommands: MemoItem[] = [];
  private initialized: boolean = false;

  constructor(private context: vscode.ExtensionContext) {
    // Read config using correct keys from package.json
    const config = vscode.workspace.getConfiguration("cursorMemo");
    this.domain = normalizeGitLabDomain(
      config.get<string>("gitlabDomain") // Use correct key
    );
    this.projectId = config.get<string>("gitlabProjectId") || "9993"; // Use correct key
    this.filePath = config.get<string>("gitlabFilePath") || "prompt.json"; // Use correct key
    this.branch = config.get<string>("gitlabBranch") || "master"; // Use correct key
  }

  /**
   * Initialize the GitLab client: load cloud commands and ensure config is present.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    // Check config on initialization
    if (!this.projectId || !this.filePath) {
      console.error("GitLab Project ID or File Path is not configured.");
      // Optionally throw an error or prevent further operations
    }
    await this.loadCloudCommands();
    this.initialized = true;
  }

  /**
   * Get all currently stored cloud commands.
   */
  public getCloudCommands(): MemoItem[] {
    return [...this.cloudCommands];
  }

  /**
   * Set GitLab Personal Access Token (used by manage token command).
   */
  public async setToken(token: string): Promise<void> {
    await this.context.secrets.store(GitlabClient.GITLAB_TOKEN_KEY, token);
  }

  /**
   * Clear stored GitLab Personal Access Token.
   */
  public async clearToken(): Promise<void> {
    await this.context.secrets.delete(GitlabClient.GITLAB_TOKEN_KEY);
  }

  /**
   * Get GitLab Personal Access Token from Secret Storage.
   * If token doesn't exist, interactively ask the user to input it.
   * (Restored from original src/gitlab.ts)
   */
  public async getToken(): Promise<string | undefined> {
    let token = await this.context.secrets.get(GitlabClient.GITLAB_TOKEN_KEY);

    if (!token) {
      // Use correct key for storing if fetched interactively
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
        // User cancelled the input
        vscode.window.showErrorMessage("GitLab token is required to sync.");
        return undefined;
      }
    }
    return token;
  }

  /**
   * Get file content from GitLab project.
   * (Restored from original src/gitlab.ts)
   *
   * @param token - GitLab Personal Access Token
   * @returns Promise resolving to the parsed file content metadata (including base64 content)
   */
  private async getFileContent(
    token: string
  ): Promise<z.infer<typeof GitLabFileContentSchema>> {
    // Ensure config is loaded (redundant if initialize is called, but safe)
    if (!this.projectId || !this.filePath) {
      throw new Error("GitLab Project ID or File Path not configured.");
    }
    const encodedProjectId = encodeURIComponent(this.projectId);
    const encodedFilePath = encodeURIComponent(this.filePath);
    const encodedRef = encodeURIComponent(this.branch);

    const url = `${this.domain}/projects/${encodedProjectId}/repository/files/${encodedFilePath}?ref=${encodedRef}`;

    try {
      const response = await fetch(url, {
        method: "GET", // Ensure method is specified
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          // Use Bearer token as in original file
          Authorization: `Bearer ${token}`,
          "User-Agent": "VSCode Cursor Memo Extension",
        },
        timeout: 15000, // Keep timeout
      });

      // Use original error handler
      await handleGitLabError(response);

      const fileData = await response.json();
      // Validate the file metadata structure against GitLabFileContentSchema
      const validationResult = GitLabFileContentSchema.safeParse(fileData);
      if (!validationResult.success) {
        console.error(
          "GitLab file metadata schema validation failed:",
          validationResult.error.errors
        );
        throw new Error(
          `Invalid file metadata format from GitLab: ${validationResult.error.message}`
        );
      }
      // Return the validated file metadata (includes base64 content)
      return validationResult.data;
    } catch (error) {
      console.error(`Error in getFileContent for ${url}:`, error);
      // Re-throw error to be handled by the caller (fetchTeamCommands)
      throw error;
    }
  }

  /**
   * Fetches, decodes, parses, and validates team commands from GitLab file content.
   * Calls getFileContent and then processes the result.
   * @returns Promise with parsed *command data* (commands and categories) or an error.
   */
  public async fetchTeamCommands(): Promise<{
    success: boolean;
    data?: z.infer<typeof teamCommandsSchema>; // Data is the parsed commands/categories
    error?: string;
  }> {
    let token: string | undefined;
    try {
      // Get token (includes interactive prompt if needed)
      token = await this.getToken();
      if (!token) {
        // getToken shows error message if user cancels
        return { success: false, error: "GitLab token not provided." };
      }

      // Fetch file metadata (includes base64 content)
      const fileData = await this.getFileContent(token);

      // Decode Base64 content
      if (!fileData.content) {
        console.error(
          "getFileContent returned success but content was missing."
        );
        return {
          success: false,
          error: "File content is empty or missing in GitLab response.",
        };
      }
      const decodedContent = Buffer.from(fileData.content, "base64").toString(
        "utf-8"
      );

      // Parse the decoded content as JSON
      let jsonData: any;
      try {
        jsonData = JSON.parse(decodedContent);
      } catch (parseError: any) {
        console.error("Failed to parse decoded JSON content:", parseError);
        return {
          success: false,
          error: `Invalid JSON content in GitLab file: ${parseError.message}`,
        };
      }

      // Validate the *parsed JSON data structure* against teamCommandsSchema
      const validationResult = teamCommandsSchema.safeParse(jsonData);
      if (!validationResult.success) {
        console.error(
          "Team commands schema validation failed:",
          validationResult.error.errors
        );
        return {
          success: false,
          error: `Invalid command data format: ${validationResult.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`,
        };
      }

      // Return the validated commands and categories
      return { success: true, data: validationResult.data };
    } catch (error: any) {
      console.error("Failed to fetch team commands from GitLab:", error);
      // Handle specific errors like 401/403 if needed, or return generic message
      let userMessage =
        error.message || "An unknown error occurred during GitLab sync.";
      if (
        error.message?.includes("401 Unauthorized") ||
        error.message?.includes("403 Forbidden")
      ) {
        userMessage =
          "Failed to fetch team commands from GitLab. Token might be invalid or lack permissions.";
        // Optionally clear the invalid token
        if (token) {
          // Maybe only clear on 401?
          // await this.clearToken();
        }
      }
      return {
        success: false,
        error: userMessage,
      };
    }
  }

  // --- Cloud Command State Management (Keep Existing Logic) ---

  /**
   * Synchronize all commands from GitLab.
   */
  public async syncFromGitLab(): Promise<{
    success: boolean;
    syncedCommands: number;
    error?: string;
  }> {
    const fetchResult = await this.fetchTeamCommands(); // Uses the restored fetch logic

    if (!fetchResult.success || !fetchResult.data) {
      return {
        success: false,
        syncedCommands: 0,
        error: fetchResult.error || "Failed to fetch or parse data from GitLab",
      };
    }

    const importedCommands: MemoItem[] = fetchResult.data.commands || [];
    const now = Date.now();

    this.cloudCommands = importedCommands.map((cmd) => {
      const label =
        cmd.label ||
        (cmd.command.length > 30
          ? `${cmd.command.slice(0, 30)}...`
          : cmd.command);
      return {
        ...cmd,
        id: `cloud_${cmd.id || now.toString()}_${Math.random()}`,
        label: label,
        timestamp: cmd.timestamp || now,
        category: cmd.category || GitlabClient.DEFAULT_CATEGORY,
        isCloud: true,
      };
    });

    await this.saveCloudCommands();

    return {
      success: true,
      syncedCommands: this.cloudCommands.length,
    };
  }

  /**
   * Synchronize selected categories from GitLab.
   */
  public async syncSelectedFromGitLab(selectedCategories: string[]): Promise<{
    success: boolean;
    syncedCommands: number;
    error?: string;
  }> {
    const fetchResult = await this.fetchTeamCommands(); // Uses the restored fetch logic

    if (!fetchResult.success || !fetchResult.data) {
      return {
        success: false,
        syncedCommands: 0,
        error: fetchResult.error || "Failed to fetch or parse data from GitLab",
      };
    }

    const allImportedCommands: MemoItem[] = fetchResult.data.commands || [];
    const now = Date.now();

    const filteredCommands = allImportedCommands.filter((cmd) =>
      selectedCategories.includes(cmd.category || GitlabClient.DEFAULT_CATEGORY)
    );

    const newCloudCommands = filteredCommands.map((cmd) => {
      const label =
        cmd.label ||
        (cmd.command.length > 30
          ? `${cmd.command.slice(0, 30)}...`
          : cmd.command);
      return {
        ...cmd,
        id: `cloud_${cmd.id || now.toString()}_${Math.random()}`,
        label: label,
        timestamp: cmd.timestamp || now,
        category: cmd.category || GitlabClient.DEFAULT_CATEGORY,
        isCloud: true,
      };
    });

    this.cloudCommands = newCloudCommands;
    await this.saveCloudCommands();

    return {
      success: true,
      syncedCommands: this.cloudCommands.length,
    };
  }

  /**
   * Remove cloud category from local storage.
   */
  public async removeCloudCategory(categoryName: string): Promise<{
    success: boolean;
    removedCommands: number;
  }> {
    const originalLength = this.cloudCommands.length;
    this.cloudCommands = this.cloudCommands.filter(
      (cmd) => cmd.category !== categoryName
    );
    const removedCount = originalLength - this.cloudCommands.length;

    if (removedCount > 0) {
      await this.saveCloudCommands();
      return { success: true, removedCommands: removedCount };
    } else {
      return { success: true, removedCommands: 0 };
    }
  }

  /**
   * Save cloud commands to global state.
   */
  private async saveCloudCommands(): Promise<void> {
    await this.context.globalState.update(
      GitlabClient.CLOUD_COMMANDS_KEY,
      this.cloudCommands
    );
  }

  /**
   * Load cloud commands from global state.
   */
  private async loadCloudCommands(): Promise<void> {
    this.cloudCommands = this.context.globalState.get<MemoItem[]>(
      GitlabClient.CLOUD_COMMANDS_KEY,
      []
    );
    this.cloudCommands = this.cloudCommands.map((cmd) => ({
      ...cmd,
      isCloud: true,
    }));
  }
}

// --- Helper Functions (Restored from original src/gitlab.ts) ---

/**
 * Normalize GitLab API URL
 */
function normalizeGitLabDomain(url?: string): string {
  if (!url) {
    // Default to gitlab.com if no URL provided in config
    console.warn("GitLab domain not configured, defaulting to gitlab.com");
    return "https://gitlab.com/api/v4";
  }

  let normalizedUrl = url.trim();
  // Remove trailing slash if present
  if (normalizedUrl.endsWith("/")) {
    normalizedUrl = normalizedUrl.slice(0, -1);
  }

  // Add /api/v4 if it's not already present
  if (!normalizedUrl.endsWith("/api/v4")) {
    normalizedUrl = `${normalizedUrl}/api/v4`;
  }

  return normalizedUrl;
}

/**
 * Handle GitLab API errors
 */
async function handleGitLabError(response: Response): Promise<void> {
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`GitLab API Error (${response.status}): ${errorBody}`); // Log the raw error

    // Specific error handling (optional)
    if (response.status === 401) {
      throw new Error(
        `GitLab API error: 401 Unauthorized. Check your Personal Access Token.`
      );
    }
    if (response.status === 403) {
      // Could be permissions or rate limit
      if (errorBody.includes("Rate limit exceeded")) {
        // Be more specific if possible
        throw new Error(`GitLab API Rate Limit Exceeded: ${errorBody}`);
      } else {
        throw new Error(
          `GitLab API error: 403 Forbidden. Check token permissions or project access. Details: ${errorBody}`
        );
      }
    }
    if (response.status === 404) {
      throw new Error(
        `GitLab API error: 404 Not Found. Check Project ID, File Path, and Branch/Ref. Details: ${errorBody}`
      );
    }

    // Generic error for other statuses
    throw new Error(
      `GitLab API error: ${response.status} ${response.statusText}. Details: ${errorBody}`
    );
  }
}
