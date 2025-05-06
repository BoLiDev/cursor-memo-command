/** @format */

import * as vscode from "vscode";
import fetch, { Response } from "node-fetch";
import * as os from "os";
import { z } from "zod";
import { GitLabFileContentSchema } from "../zod/gitlab";
import {
  GitLabBranchResponseSchema,
  GitLabMergeRequestResponseSchema,
  GitLabFileCommitResponseSchema,
} from "../zod/gitlab-mr";
import { MemoItem } from "../models/memo-item";
import { LocalMemoService } from "./local-data-service";
import {
  fromMemoItems,
  parseCommands,
  serializeCommands,
  toMemoItems,
} from "../zod/command-schema";
import { StorageService } from "./storage-service";
import { ConfigurationService } from "./configuration-service";

/**
 * Service for interacting with GitLab API, including fetching and managing cloud commands.
 * Combines original fetch logic with cloud state management.
 */
export class GitlabClient {
  private static GITLAB_TOKEN_KEY = "cursor-memo-gitlab-token";
  private static CLOUD_COMMANDS_KEY = "cursor-memo-cloud-commands";
  private static DEFAULT_CATEGORY = "Default";

  private cloudCommands: MemoItem[] = [];
  private initialized: boolean = false;

  constructor(
    private storageService: StorageService,
    private configService: ConfigurationService
  ) {
    // Configuration is now handled by ConfigurationService
    // Listen for config changes if needed to re-initialize or update internal state
    // configService.onDidChangeConfiguration(() => { ... });
  }

  /**
   * Initialize the GitLab client: load cloud commands and ensure config is present.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (
      !this.configService.getGitlabProjectId() ||
      !this.configService.getGitlabFilePath()
    ) {
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
    await this.storageService.setSecret(GitlabClient.GITLAB_TOKEN_KEY, token);
  }

  /**
   * Clear stored GitLab Personal Access Token.
   */
  public async clearToken(): Promise<void> {
    await this.storageService.deleteSecret(GitlabClient.GITLAB_TOKEN_KEY);
  }

  /**
   * Get GitLab Personal Access Token from Secret Storage.
   * If token doesn't exist, interactively ask the user to input it.
   */
  public async getToken(): Promise<string | undefined> {
    let token = await this.storageService.getSecret(
      GitlabClient.GITLAB_TOKEN_KEY
    );

    if (!token) {
      const inputToken = await vscode.window.showInputBox({
        prompt: "Enter GitLab Personal Access Token",
        placeHolder: "Enter your GitLab token to sync team commands",
        password: true,
        ignoreFocusOut: true,
        title: "GitLab Authentication",
      });

      if (inputToken) {
        await this.storageService.setSecret(
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
    const projectId = this.configService.getGitlabProjectId();
    const filePath = this.configService.getGitlabFilePath();
    const branch = this.configService.getGitlabBranch();
    const domain = this.configService.getGitlabDomain();

    if (!projectId || !filePath) {
      throw new Error("GitLab Project ID or File Path not configured.");
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
   * @returns Promise with parsed command data or an error.
   */
  public async fetchTeamCommands(): Promise<{
    success: boolean;
    data?: { commands: MemoItem[]; categories: string[] };
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

      try {
        // 解析新格式数据
        const commandsData = parseCommands(decodedContent);

        // 转换为内部格式
        const commands = toMemoItems(commandsData);
        const categories = Object.keys(commandsData);

        return {
          success: true,
          data: {
            commands,
            categories,
          },
        };
      } catch (parseError: any) {
        console.error("Failed to parse command data:", parseError);
        return {
          success: false,
          error: `Invalid command data: ${parseError.message}`,
        };
      }
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

    // 使用转换后的 MemoItem[]
    this.cloudCommands = fetchResult.data.commands.map((cmd) => ({
      ...cmd,
      isCloud: true,
    }));

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

    // 使用转换后的 MemoItem[]
    const allImportedCommands: MemoItem[] = fetchResult.data.commands || [];

    const filteredCommands = allImportedCommands.filter((cmd) =>
      selectedCategories.includes(cmd.category || GitlabClient.DEFAULT_CATEGORY)
    );

    this.cloudCommands = filteredCommands.map((cmd) => ({
      ...cmd,
      isCloud: true,
    }));

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

    // 直接返回 fetchResult 中解析出的 categories
    return fetchResult.data.categories || [];
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
    await this.storageService.setValue(
      GitlabClient.CLOUD_COMMANDS_KEY,
      this.cloudCommands
    );
  }

  /**
   * Load cloud commands from global state.
   */
  private async loadCloudCommands(): Promise<void> {
    this.cloudCommands = this.storageService.getValue<MemoItem[]>(
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
    refBranch?: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    const projectId = this.configService.getGitlabProjectId();
    const domain = this.configService.getGitlabDomain();
    const defaultBranch = this.configService.getGitlabBranch();

    if (!projectId) {
      return { success: false, error: "GitLab Project ID not configured." };
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
    const projectId = this.configService.getGitlabProjectId();
    const domain = this.configService.getGitlabDomain();

    if (!projectId) {
      return { success: false, error: "GitLab Project ID not configured." };
    }

    const encodedProjectId = encodeURIComponent(projectId);
    const encodedFilePath = encodeURIComponent(filePath);
    const url = `${domain}/projects/${encodedProjectId}/repository/files/${encodedFilePath}`;

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
    const projectId = this.configService.getGitlabProjectId();
    const domain = this.configService.getGitlabDomain();

    if (!projectId) {
      return { success: false, error: "GitLab Project ID not configured." };
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
   * 将指定的命令推送到 GitLab 仓库（通过创建合并请求）
   * @param commands 要推送的命令数组
   * @param categories 涉及的分类数组
   * @returns 推送结果
   */
  public async pushCommandsToGitLab(
    commands: MemoItem[],
    categories: string[]
  ): Promise<{
    success: boolean;
    mergeRequestUrl?: string;
    pushedCommands: number;
    error?: string;
  }> {
    try {
      const token = await this.getToken();
      if (!token) {
        return {
          success: false,
          pushedCommands: 0,
          error: "GitLab token not provided.",
        };
      }

      if (commands.length === 0) {
        return {
          success: false,
          pushedCommands: 0,
          error: "No commands selected for pushing.",
        };
      }

      const fetchResult = await this.fetchTeamCommands();
      if (!fetchResult.success) {
        return {
          success: false,
          pushedCommands: 0,
          error: fetchResult.error || "Failed to fetch remote file.",
        };
      }

      // 获取所有远程和本地命令合并后的结果
      const allCommands = [...(fetchResult.data?.commands || []), ...commands];

      // 确保每个命令都有 alias
      const processedCommands = allCommands.map((cmd) => ({
        ...cmd,
        alias: cmd.alias || cmd.label,
      }));

      // 移除重复项（基于 id 或 alias+category 组合）
      const uniqueCommands = removeDuplicateCommands(processedCommands);

      // 计算新增的命令数量
      const newCommandsCount =
        uniqueCommands.length - (fetchResult.data?.commands.length || 0);

      // 转换为新的数据格式
      const commandsData = fromMemoItems(uniqueCommands);

      // 序列化为 JSON 字符串
      const newFileContent = serializeCommands(commandsData);

      // 创建分支
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

      // 提交文件
      const commitResult = await this.commitFileChange(
        token,
        branchName,
        this.configService.getGitlabFilePath() || "",
        newFileContent,
        `Update prompt commands: added ${newCommandsCount} new commands, updated ${commands.length - newCommandsCount} commands.`
      );

      if (!commitResult.success) {
        return {
          success: false,
          pushedCommands: 0,
          error: commitResult.error || "Failed to commit file.",
        };
      }

      // 创建合并请求
      const mrResult = await this.createMergeRequest(
        token,
        branchName,
        this.configService.getGitlabBranch() || "",
        `Update prompt commands from ${os.hostname() || "local"}`,
        `This merge request adds ${newCommandsCount} new commands and updates ${commands.length - newCommandsCount} existing commands from categories: ${categories.join(", ")}.`
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
        pushedCommands: commands.length,
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

  /**
   * 将本地选定的 prompt 推送到 GitLab 仓库（通过创建合并请求）
   * @param selectedCategories 选定的本地分类名称数组
   * @param localMemoService 本地 memo 服务
   * @returns 推送结果
   */
  public async pushCategoriesToGitLab(
    selectedCategories: string[],
    localMemoService: LocalMemoService
  ): Promise<{
    success: boolean;
    mergeRequestUrl?: string;
    pushedCommands: number;
    error?: string;
  }> {
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

    return this.pushCommandsToGitLab(localCommands, selectedCategories);
  }
}

// --- Helper Functions ---

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

/**
 * 根据 id 或 alias+category 组合去除重复的命令
 */
function removeDuplicateCommands(commands: MemoItem[]): MemoItem[] {
  const idMap = new Map<string, MemoItem>();
  const aliasMap = new Map<string, MemoItem>();

  // 优先保留本地命令，覆盖云端命令
  commands.sort((a, b) => {
    if (a.isCloud && !b.isCloud) return -1;
    if (!a.isCloud && b.isCloud) return 1;
    return 0;
  });

  commands.forEach((cmd) => {
    // 如果有 ID，用 ID 作为唯一键
    if (cmd.id) {
      idMap.set(cmd.id, cmd);
    }

    // 同时用 alias+category 作为唯一键
    if (cmd.alias) {
      const key = `${cmd.category}:${cmd.alias}`;
      aliasMap.set(key, cmd);
    }
  });

  // 合并两个 Map 的值
  const resultMap = new Map<string, MemoItem>();
  idMap.forEach((cmd) => {
    resultMap.set(cmd.id, cmd);
  });

  aliasMap.forEach((cmd, key) => {
    if (!resultMap.has(cmd.id)) {
      resultMap.set(cmd.id, cmd);
    }
  });

  return Array.from(resultMap.values());
}
