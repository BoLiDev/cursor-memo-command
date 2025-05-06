/** @format */

import * as vscode from "vscode";
import * as os from "os";
import { MemoItem } from "../models/memo-item";
import {
  parseCommands,
  serializeCommands,
  CommandsStructureSchema,
} from "../zod";
import { VscodeStorageService } from "./vscode-storage-service";
import { ConfigurationService } from "./configuration-service";
import { GitlabApiService, GitlabApiError } from "./cloud-api-service";
import { z } from "zod";

export type CloudOperationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; needsAuth?: boolean };

/**
 * Manages the state of cloud-synchronized commands.
 * Interacts with GitlabApiService to fetch/push data and StorageService to persist state.
 */
export class CloudService {
  private static GITLAB_TOKEN_KEY = "cursor-memo-gitlab-token";
  private static CLOUD_COMMANDS_KEY = "cursor-memo-cloud-commands";
  private static DEFAULT_CATEGORY = "Default";

  private _onDidCloudCommandsChange = new vscode.EventEmitter<void>();
  readonly onDidCloudCommandsChange: vscode.Event<void> =
    this._onDidCloudCommandsChange.event;

  private cloudCommands: MemoItem[] = [];
  private initialized: boolean = false;

  constructor(
    private storageService: VscodeStorageService,
    private configService: ConfigurationService,
    private gitlabApiService: GitlabApiService
  ) {}

  /**
   * Initialize the service by loading stored cloud commands.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
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
   * Parses the command data string and transforms it into MemoItems.
   * @param decodedContent The raw string content from GitLab.
   * @returns An object containing the parsed commands structure and the transformed MemoItems array.
   * @throws If parsing or validation fails.
   */
  private _parseAndTransformCommands(decodedContent: string): {
    commandsData: z.infer<typeof CommandsStructureSchema>;
    commands: Omit<MemoItem, "isCloud">[];
  } {
    const commandsData = parseCommands(decodedContent);
    const now = Date.now();
    const items: Omit<MemoItem, "isCloud">[] = [];

    Object.entries(commandsData).forEach(([categoryName, commands]) => {
      Object.entries(commands).forEach(([alias, commandObj]) => {
        const command = commandObj.content;
        const label =
          command.length > 30 ? `${command.slice(0, 30)}...` : command;
        const categoryId = categoryName;

        items.push({
          id: `cmd_${now}_${Math.random().toString().slice(2)}`,
          label,
          command,
          timestamp: now,
          alias,
          categoryId: categoryId,
        });
      });
    });
    return { commandsData, commands: items };
  }

  /**
   * Fetches, decodes, parses, and validates team commands from GitLab.
   * Does not update internal state.
   */
  private async fetchAndParseTeamCommands(): Promise<
    CloudOperationResult<{ commands: MemoItem[]; categories: string[] }>
  > {
    try {
      const fileData = await this.gitlabApiService.getFileContent();

      if (!fileData.content) {
        return {
          success: false,
          error: "File content is empty or missing in GitLab response.",
        };
      }

      const decodedContent = Buffer.from(fileData.content, "base64").toString(
        "utf-8"
      );

      try {
        const { commandsData, commands } =
          this._parseAndTransformCommands(decodedContent);
        const categories = Object.keys(commandsData);
        return {
          success: true,
          data: { commands: commands as MemoItem[], categories },
        };
      } catch (parseError: any) {
        return {
          success: false,
          error: `Invalid command data: ${parseError.message}`,
        };
      }
    } catch (error) {
      if (error instanceof GitlabApiError && error.status === 401) {
        return { success: false, error: error.message, needsAuth: true };
      }
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error fetching team commands";
      return { success: false, error: message };
    }
  }

  /**
   * Fetches all commands from GitLab and updates the local cloud state.
   */
  public async syncAllFromGitLab(): Promise<
    CloudOperationResult<{ syncedCommands: number }>
  > {
    const fetchResult = await this.fetchAndParseTeamCommands();

    if (!fetchResult.success) {
      return fetchResult;
    }

    this.cloudCommands = fetchResult.data.commands.map((cmd) => ({
      ...cmd,
      isCloud: true,
    }));

    await this.saveCloudCommands();
    this._onDidCloudCommandsChange.fire();
    return {
      success: true,
      data: { syncedCommands: this.cloudCommands.length },
    };
  }

  /**
   * Fetches commands from GitLab, filters by selected categories, and updates local cloud state.
   */
  public async syncSelectedFromGitLab(
    selectedCategories: string[]
  ): Promise<CloudOperationResult<{ syncedCommands: number }>> {
    const fetchResult = await this.fetchAndParseTeamCommands();

    if (!fetchResult.success) {
      return fetchResult;
    }

    const allImportedCommands: MemoItem[] = fetchResult.data.commands || [];
    const filteredCommands = allImportedCommands.filter((cmd) =>
      selectedCategories.includes(
        cmd.categoryId || CloudService.DEFAULT_CATEGORY
      )
    );

    // 获取所有新命令，并标记为云命令
    const newCloudCommands = filteredCommands.map((cmd) => ({
      ...cmd,
      isCloud: true,
    }));

    // 从现有云命令中移除与新选定类别冲突的命令
    const existingCommands = this.cloudCommands.filter(
      (cmd) =>
        !selectedCategories.includes(
          cmd.categoryId || CloudService.DEFAULT_CATEGORY
        )
    );

    // 合并现有命令和新命令
    this.cloudCommands = [...existingCommands, ...newCloudCommands];

    await this.saveCloudCommands();
    this._onDidCloudCommandsChange.fire();
    return {
      success: true,
      data: { syncedCommands: newCloudCommands.length },
    };
  }

  /**
   * Fetches available categories from GitLab without updating local state.
   */
  public async fetchAvailableCategories(): Promise<
    CloudOperationResult<string[]>
  > {
    const fetchResult = await this.fetchAndParseTeamCommands();
    if (!fetchResult.success) {
      return fetchResult;
    }
    return { success: true, data: fetchResult.data.categories || [] };
  }

  /**
   * Removes a cloud category and its associated commands from the local cloud state.
   */
  public async removeCloudCategory(categoryName: string): Promise<{
    success: boolean;
    removedCommands: number;
  }> {
    const originalLength = this.cloudCommands.length;
    this.cloudCommands = this.cloudCommands.filter(
      (cmd) => cmd.categoryId !== categoryName
    );
    const removedCount = originalLength - this.cloudCommands.length;

    if (removedCount > 0) {
      await this.saveCloudCommands();
      this._onDidCloudCommandsChange.fire();
      return { success: true, removedCommands: removedCount };
    } else {
      return { success: true, removedCommands: 0 };
    }
  }

  /**
   * Pushes specified commands to GitLab by creating a merge request.
   * Merges provided commands with the current remote state before pushing.
   * @param commandsToPush Array of MemoItems to add/update in GitLab.
   * @param involvedCategories List of category IDs/names involved (for commit/MR message).
   */
  public async pushCommandsToGitLab(
    commandsToPush: MemoItem[],
    involvedCategories: string[]
  ): Promise<
    CloudOperationResult<{ mergeRequestUrl: string; pushedCommands: number }>
  > {
    if (commandsToPush.length === 0) {
      return { success: false, error: "No commands selected for pushing." };
    }

    try {
      // 1. Fetch current remote state
      const fetchResult = await this.fetchAndParseTeamCommands();

      let remoteCommands: MemoItem[] = [];
      if (fetchResult.success) {
        remoteCommands = fetchResult.data.commands;
      } else if (fetchResult.needsAuth) {
        return fetchResult;
      } else if (fetchResult.error && !fetchResult.error.includes("404")) {
        return {
          success: false,
          error: `Failed to fetch remote state: ${fetchResult.error}`,
        };
      }

      // 2. Merge and prepare new content
      const allCommands = [...remoteCommands, ...commandsToPush];
      const processedCommands = allCommands.map((cmd) => ({
        ...cmd,
        alias: cmd.alias || cmd.label,
      }));
      const uniqueCommands = removeDuplicateCommands(processedCommands);
      const commandsData = this._transformMemoItemsToStructure(uniqueCommands);
      const newFileContent = serializeCommands(commandsData);
      const newFileContentBase64 =
        Buffer.from(newFileContent).toString("base64");

      const newCommandsCount = uniqueCommands.length - remoteCommands.length;
      const updatedCount = commandsToPush.length - newCommandsCount;

      // 3. Create Branch
      const timestamp = new Date().toISOString().replace(/[:.-]/g, "_");
      const branchName = `cursor_memo_update_${timestamp}`;
      await this.gitlabApiService.createBranch(branchName);

      // 4. Commit File
      const filePath = this.configService.getGitlabFilePath();
      const commitMessage = `Update prompt commands: added ${newCommandsCount} new, updated ${updatedCount}.`;
      await this.gitlabApiService.commitFileChange(
        branchName,
        filePath,
        newFileContentBase64,
        commitMessage
      );

      // 5. Create Merge Request
      const targetBranch = this.configService.getGitlabBranch();
      const mrTitle = `Update prompt commands from ${os.hostname() || "local"}`;
      const mrDescription = `This merge request adds ${newCommandsCount} new command(s) and updates ${updatedCount} existing command(s) from categories: ${involvedCategories.join(", ")}.`;
      const mrResult = await this.gitlabApiService.createMergeRequest(
        branchName,
        targetBranch,
        mrTitle,
        mrDescription
      );

      return {
        success: true,
        data: {
          mergeRequestUrl: mrResult.web_url,
          pushedCommands: commandsToPush.length,
        },
      };
    } catch (error) {
      if (error instanceof GitlabApiError && error.status === 401) {
        return { success: false, error: error.message, needsAuth: true };
      }
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error during push operation.";
      return { success: false, error: message };
    }
  }

  /**
   * Set GitLab Personal Access Token.
   */
  public async setToken(token: string): Promise<void> {
    await this.storageService.setSecret(CloudService.GITLAB_TOKEN_KEY, token);
  }

  /**
   * Clear stored GitLab Personal Access Token.
   */
  public async clearToken(): Promise<void> {
    await this.storageService.deleteSecret(CloudService.GITLAB_TOKEN_KEY);
  }

  private async saveCloudCommands(): Promise<void> {
    await this.storageService.setValue(
      CloudService.CLOUD_COMMANDS_KEY,
      this.cloudCommands
    );
  }

  private async loadCloudCommands(): Promise<void> {
    const stored = this.storageService.getValue<MemoItem[]>(
      CloudService.CLOUD_COMMANDS_KEY,
      []
    );
    this.cloudCommands = stored.map((cmd) => ({ ...cmd, isCloud: true }));
  }

  /**
   * Transforms an array of MemoItems into the nested structure expected by GitLab/export format.
   * @param items The MemoItem array.
   * @returns The nested command structure.
   */
  private _transformMemoItemsToStructure(
    items: MemoItem[]
  ): z.infer<typeof CommandsStructureSchema> {
    const result: z.infer<typeof CommandsStructureSchema> = {};

    items.forEach((item) => {
      const categoryName = item.categoryId;
      const alias = item.alias || item.label || "Unnamed Command";

      if (!result[categoryName]) {
        result[categoryName] = {};
      }

      if (!result[categoryName][alias]) {
        result[categoryName][alias] = {
          content: item.command,
        };
      }
    });

    return result;
  }
}

// TODO: Move this to a shared utility module?
function removeDuplicateCommands(commands: MemoItem[]): MemoItem[] {
  const finalMap = new Map<string, MemoItem>();

  commands.forEach((cmd) => {
    const aliasKey = `${cmd.categoryId}:${cmd.alias || cmd.label}`;
    // Always add/overwrite by ID if present
    if (cmd.id) {
      const existingById = finalMap.get(cmd.id);
      if (!existingById || !existingById.isCloud || cmd.isCloud === false) {
        finalMap.set(cmd.id, cmd);
      }
    }
    // Add/overwrite by alias+category key, preferring local
    const existingByAlias = finalMap.get(aliasKey);
    if (!existingByAlias || !existingByAlias.isCloud || cmd.isCloud === false) {
      let alreadyPresentById = false;
      if (cmd.id) {
        finalMap.forEach((value, key) => {
          if (value.id === cmd.id && key !== aliasKey && key !== cmd.id) {
            alreadyPresentById = true;
            if (!value.isCloud || cmd.isCloud === false) {
              finalMap.delete(key);
              finalMap.set(aliasKey, cmd);
            }
          }
        });
      }
      if (!alreadyPresentById) {
        finalMap.set(aliasKey, cmd);
      }
    }
    // If cmd.id exists and is different from aliasKey, ensure it's in the map.
    if (cmd.id && cmd.id !== aliasKey && !finalMap.has(cmd.id)) {
      const existingById = finalMap.get(cmd.id);
      if (!existingById || !existingById.isCloud || cmd.isCloud === false) {
        finalMap.set(cmd.id, cmd);
      }
    }
  });

  // Filter results to ensure no duplicate IDs resulted from alias mapping overwrite
  const uniqueByIdResult: MemoItem[] = [];
  const seenIds = new Set<string>();
  finalMap.forEach((item) => {
    if (item.id && !seenIds.has(item.id)) {
      uniqueByIdResult.push(item);
      seenIds.add(item.id);
    } else if (!item.id) {
      uniqueByIdResult.push(item);
    }
  });

  return uniqueByIdResult;
}
