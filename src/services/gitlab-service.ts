/** @format */

import * as vscode from "vscode";
import fetch, { Response } from "node-fetch";
import * as os from "os";
import { z } from "zod";
import { MemoItemSchema, GitLabFileContentSchema } from "../zod/gitlab";
import {
  GitLabBranchResponseSchema,
  GitLabMergeRequestResponseSchema,
  GitLabFileCommitResponseSchema,
} from "../zod/gitlab-mr";
import { MemoItem } from "../models/memo-item";
import { LocalMemoService } from "./local-data-service";

// Schema for the structure inside the decoded GitLab file content
const teamCommandsSchema = z.object({
  commands: z.array(MemoItemSchema),
  categories: z.array(z.string()).optional(),
});

/**
 * Service for interacting with GitLab API, including fetching and managing cloud commands.
 * Combines original fetch logic with cloud state management.
 */
export class GitlabClient {
  private static GITLAB_TOKEN_KEY = "cursor-memo-gitlab-token";
  private static CLOUD_COMMANDS_KEY = "cursor-memo-cloud-commands";
  private static DEFAULT_CATEGORY = "Default";

  private domain: string;
  private projectId: string;
  private filePath: string;
  private branch: string;

  private cloudCommands: MemoItem[] = [];
  private initialized: boolean = false;

  constructor(private context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration("cursorMemo");
    this.domain = normalizeGitLabDomain(config.get<string>("gitlabDomain"));
    this.projectId = config.get<string>("gitlabProjectId") || "9993";
    this.filePath = config.get<string>("gitlabFilePath") || "prompt.json";
    this.branch = config.get<string>("gitlabBranch") || "master";
  }

  /**
   * Initialize the GitLab client: load cloud commands and ensure config is present.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (!this.projectId || !this.filePath) {
      console.error("GitLab Project ID or File Path is not configured.");
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
        vscode.window.showErrorMessage("GitLab token is required to sync.");
        return undefined;
      }
    }
    return token;
  }

  /**
   * Get file content from GitLab project.
   *
   * @param token - GitLab Personal Access Token
   * @returns Promise resolving to the parsed file content metadata (including base64 content)
   */
  private async getFileContent(
    token: string
  ): Promise<z.infer<typeof GitLabFileContentSchema>> {
    if (!this.projectId || !this.filePath) {
      throw new Error("GitLab Project ID or File Path not configured.");
    }
    const encodedProjectId = encodeURIComponent(this.projectId);
    const encodedFilePath = encodeURIComponent(this.filePath);
    const encodedRef = encodeURIComponent(this.branch);

    const url = `${this.domain}/projects/${encodedProjectId}/repository/files/${encodedFilePath}?ref=${encodedRef}`;

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

      await handleGitLabError(response);

      const fileData = await response.json();
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
      return validationResult.data;
    } catch (error) {
      console.error(`Error in getFileContent for ${url}:`, error);
      throw error;
    }
  }

  /**
   * Fetches, decodes, parses, and validates team commands from GitLab file content.
   * Calls getFileContent and then processes the result.
   * @returns Promise with parsed command data (commands and categories) or an error.
   */
  public async fetchTeamCommands(): Promise<{
    success: boolean;
    data?: z.infer<typeof teamCommandsSchema>;
    error?: string;
  }> {
    let token: string | undefined;
    try {
      token = await this.getToken();
      if (!token) {
        return { success: false, error: "GitLab token not provided." };
      }

      const fileData = await this.getFileContent(token);

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

      return { success: true, data: validationResult.data };
    } catch (error: any) {
      console.error("Failed to fetch team commands from GitLab:", error);
      let userMessage =
        error.message || "An unknown error occurred during GitLab sync.";
      if (
        error.message?.includes("401 Unauthorized") ||
        error.message?.includes("403 Forbidden")
      ) {
        userMessage =
          "Failed to fetch team commands from GitLab. Token might be invalid or lack permissions.";
      }
      return {
        success: false,
        error: userMessage,
      };
    }
  }

  // --- Cloud Command State Management ---

  /**
   * Synchronize all commands from GitLab.
   */
  public async syncFromGitLab(): Promise<{
    success: boolean;
    syncedCommands: number;
    error?: string;
  }> {
    const fetchResult = await this.fetchTeamCommands();

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
    const fetchResult = await this.fetchTeamCommands();

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
   * Fetch all available categories from GitLab.
   */
  public async fetchAvailableCategories(): Promise<string[]> {
    const fetchResult = await this.fetchTeamCommands();

    if (!fetchResult.success || !fetchResult.data) {
      throw new Error(
        fetchResult.error || "Failed to fetch or parse data from GitLab"
      );
    }

    // Get categories explicitly defined in the file
    const explicitCategories = fetchResult.data.categories || [];

    // Also collect all categories used in individual commands
    const commandCategories = new Set<string>();
    const allImportedCommands: MemoItem[] = fetchResult.data.commands || [];

    allImportedCommands.forEach((cmd) => {
      const category = cmd.category || GitlabClient.DEFAULT_CATEGORY;
      commandCategories.add(category);
    });

    // Combine both sources of categories
    const allCategories = [
      ...new Set([...explicitCategories, ...commandCategories]),
    ];

    return allCategories;
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

  /**
   * 创建新分支
   * @param token GitLab 访问令牌
   * @param branchName 新分支名称
   * @param refBranch 参考分支名称
   * @returns 创建结果
   */
  private async createBranch(
    token: string,
    branchName: string,
    refBranch: string = this.branch
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.projectId) {
      return { success: false, error: "GitLab Project ID not configured." };
    }

    const encodedProjectId = encodeURIComponent(this.projectId);
    const url = `${this.domain}/projects/${encodedProjectId}/repository/branches`;

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
          ref: refBranch,
        }),
      });

      if (!response.ok) {
        await handleGitLabError(response);
      }

      const data = await response.json();
      const validationResult = GitLabBranchResponseSchema.safeParse(data);

      if (!validationResult.success) {
        console.error(
          "Branch creation response validation failed:",
          validationResult.error.errors
        );
        return {
          success: false,
          error: "Invalid branch creation response format",
        };
      }

      return { success: true };
    } catch (error: any) {
      console.error(`Error creating branch in GitLab: ${error}`);
      return {
        success: false,
        error: error.message || "Unknown error creating branch",
      };
    }
  }

  /**
   * 提交文件修改
   * @param token GitLab 访问令牌
   * @param branchName 目标分支
   * @param filePath 文件路径
   * @param content 文件内容
   * @param commitMessage 提交信息
   * @returns 提交结果
   */
  private async commitFileChange(
    token: string,
    branchName: string,
    filePath: string,
    content: string,
    commitMessage: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.projectId) {
      return { success: false, error: "GitLab Project ID not configured." };
    }

    const encodedProjectId = encodeURIComponent(this.projectId);
    const encodedFilePath = encodeURIComponent(filePath);
    const url = `${this.domain}/projects/${encodedProjectId}/repository/files/${encodedFilePath}`;

    try {
      // 检查文件是否存在
      let method = "POST"; // 默认是创建

      try {
        const checkResponse = await fetch(
          `${url}?ref=${encodeURIComponent(branchName)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "User-Agent": "VSCode Cursor Memo Extension",
            },
          }
        );

        if (checkResponse.ok) {
          method = "PUT"; // 文件存在，使用PUT更新
        }
      } catch (error) {
        // 文件不存在，使用POST创建
        method = "POST";
      }

      // 提交文件
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "VSCode Cursor Memo Extension",
        },
        body: JSON.stringify({
          branch: branchName,
          content: Buffer.from(content).toString("base64"),
          encoding: "base64",
          commit_message: commitMessage,
        }),
      });

      if (!response.ok) {
        await handleGitLabError(response);
      }

      const data = await response.json();
      const validationResult = GitLabFileCommitResponseSchema.safeParse(data);

      if (!validationResult.success) {
        console.error(
          "File commit response validation failed:",
          validationResult.error.errors
        );
        return {
          success: false,
          error: "Invalid file commit response format",
        };
      }

      return { success: true };
    } catch (error: any) {
      console.error(`Error committing file to GitLab: ${error}`);
      return {
        success: false,
        error: error.message || "Unknown error committing file",
      };
    }
  }

  /**
   * 创建合并请求
   * @param token GitLab 访问令牌
   * @param sourceBranch 源分支名称
   * @param targetBranch 目标分支名称
   * @param title 合并请求标题
   * @param description 合并请求描述
   * @returns 创建结果，包含合并请求URL
   */
  private async createMergeRequest(
    token: string,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description: string
  ): Promise<{
    success: boolean;
    mergeRequestUrl?: string;
    error?: string;
  }> {
    if (!this.projectId) {
      return { success: false, error: "GitLab Project ID not configured." };
    }

    const encodedProjectId = encodeURIComponent(this.projectId);
    const url = `${this.domain}/projects/${encodedProjectId}/merge_requests`;

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
          remove_source_branch: true, // 可选: 合并后删除源分支
        }),
      });

      if (!response.ok) {
        await handleGitLabError(response);
      }

      const data = await response.json();
      const validationResult = GitLabMergeRequestResponseSchema.safeParse(data);

      if (!validationResult.success) {
        console.error(
          "Merge request creation response validation failed:",
          validationResult.error.errors
        );
        return {
          success: false,
          error: "Invalid merge request creation response format",
        };
      }

      return {
        success: true,
        mergeRequestUrl: validationResult.data.web_url,
      };
    } catch (error: any) {
      console.error(`Error creating merge request in GitLab: ${error}`);
      return {
        success: false,
        error: error.message || "Unknown error creating merge request",
      };
    }
  }

  /**
   * 将本地选定的 prompt 推送到 GitLab 仓库（通过创建合并请求）
   * @param selectedCategories 选定的本地分类名称数组
   * @param localMemoService 本地 memo 服务
   * @returns 推送结果
   */
  public async pushSelectedToGitLab(
    selectedCategories: string[],
    localMemoService: LocalMemoService
  ): Promise<{
    success: boolean;
    mergeRequestUrl?: string;
    pushedCommands: number;
    error?: string;
  }> {
    try {
      // 1. 获取 GitLab 访问令牌
      const token = await this.getToken();
      if (!token) {
        return {
          success: false,
          pushedCommands: 0,
          error: "GitLab token not provided.",
        };
      }

      // 2. 获取要推送的本地命令
      const localCommands = localMemoService
        .getCommands()
        .filter((cmd) => selectedCategories.includes(cmd.category));

      if (localCommands.length === 0) {
        return {
          success: false,
          pushedCommands: 0,
          error: "No commands selected for pushing.",
        };
      }

      // 3. 获取远程文件内容
      const fetchResult = await this.fetchTeamCommands();
      if (!fetchResult.success) {
        return {
          success: false,
          pushedCommands: 0,
          error: fetchResult.error || "Failed to fetch remote file.",
        };
      }

      // 4. 合并本地和远程命令
      const remoteCommands = fetchResult.data?.commands || [];
      const remoteCategories = fetchResult.data?.categories || [];

      // 创建合并后的命令和类别集
      const mergedCommands = [...remoteCommands];
      const mergedCategories = new Set(remoteCategories);

      // 添加本地命令到合并列表
      let newCommandsCount = 0;

      for (const localCommand of localCommands) {
        // 去掉本地属性，准备推送
        const commandToAdd = {
          id: localCommand.id.includes("_imported_")
            ? localCommand.id.split("_imported_")[0]
            : localCommand.id,
          label: localCommand.label,
          command: localCommand.command,
          timestamp: localCommand.timestamp,
          category: localCommand.category,
          alias: localCommand.alias,
        };

        // 检查是否存在同ID命令
        const existingIndex = mergedCommands.findIndex(
          (cmd) => cmd.id === commandToAdd.id
        );

        if (existingIndex >= 0) {
          // 更新现有命令
          mergedCommands[existingIndex] = commandToAdd;
        } else {
          // 添加新命令
          mergedCommands.push(commandToAdd);
          newCommandsCount++;
        }

        // 添加类别
        mergedCategories.add(localCommand.category);
      }

      // 5. 准备新的文件内容
      const newFileContent = JSON.stringify(
        {
          commands: mergedCommands,
          categories: Array.from(mergedCategories),
        },
        null,
        2
      );

      // 6. 创建新分支
      const timestamp = new Date().toISOString().replace(/[:.-]/g, "_");
      const branchName = `cursor_memo_update_${timestamp}`;

      const branchResult = await this.createBranch(token, branchName);
      if (!branchResult.success) {
        return {
          success: false,
          pushedCommands: 0,
          error: branchResult.error || "Failed to create branch.",
        };
      }

      // 7. 提交文件
      const commitResult = await this.commitFileChange(
        token,
        branchName,
        this.filePath,
        newFileContent,
        `Update prompt commands: added ${newCommandsCount} new commands, updated ${localCommands.length - newCommandsCount} commands.`
      );

      if (!commitResult.success) {
        return {
          success: false,
          pushedCommands: 0,
          error: commitResult.error || "Failed to commit file.",
        };
      }

      // 8. 创建合并请求
      const mrResult = await this.createMergeRequest(
        token,
        branchName,
        this.branch, // 目标分支是配置的主分支
        `Update prompt commands from ${os.hostname() || "local"}`,
        `This merge request adds ${newCommandsCount} new commands and updates ${localCommands.length - newCommandsCount} existing commands in categories: ${selectedCategories.join(", ")}.`
      );

      if (!mrResult.success) {
        return {
          success: false,
          pushedCommands: 0,
          error: mrResult.error || "Failed to create merge request.",
        };
      }

      return {
        success: true,
        mergeRequestUrl: mrResult.mergeRequestUrl,
        pushedCommands: localCommands.length,
      };
    } catch (error: any) {
      console.error("Error pushing to GitLab:", error);
      return {
        success: false,
        pushedCommands: 0,
        error: error.message || "Unknown error during push operation.",
      };
    }
  }
}

// --- Helper Functions ---

/**
 * Normalize GitLab API URL
 */
function normalizeGitLabDomain(url?: string): string {
  if (!url) {
    console.warn("GitLab domain not configured, defaulting to gitlab.com");
    return "https://gitlab.com/api/v4";
  }

  let normalizedUrl = url.trim();
  if (normalizedUrl.endsWith("/")) {
    normalizedUrl = normalizedUrl.slice(0, -1);
  }

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
    console.error(`GitLab API Error (${response.status}): ${errorBody}`);

    if (response.status === 401) {
      throw new Error(
        `GitLab API error: 401 Unauthorized. Check your Personal Access Token.`
      );
    }
    if (response.status === 403) {
      if (errorBody.includes("Rate limit exceeded")) {
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

    throw new Error(
      `GitLab API error: ${response.status} ${response.statusText}. Details: ${errorBody}`
    );
  }
}
