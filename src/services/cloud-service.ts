/** @format */

import * as vscode from "vscode";
import { Prompt } from "../models/prompt";
import { parsePrompts, serializePrompts, PromptsStructureSchema } from "../zod";
import { VscodeStorageService } from "./vscode-storage-service";
import { ConfigurationService } from "./vscode-configuration-service";
import { GitlabApiService, GitlabApiError } from "./cloud-api-service";
import { z } from "zod";
import {
  removeDuplicatePrompts,
  isDuplicatePrompt,
  filterOutDuplicates,
  isSamePrompt,
} from "../utils";

export type CloudOperationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; needsAuth?: boolean };

/**
 * Manages the state of cloud-synchronized prompts.
 * Interacts with GitlabApiService to fetch/push data and StorageService to persist state.
 */
export class CloudService {
  private static GITLAB_TOKEN_KEY = "cursor-cloud-gitlab-token";
  private static CLOUD_PROMPTS_KEY = "cursor-cloud-prompts";
  private static CLOUD_CATEGORIES_KEY = "cursor-cloud-categories";
  public static DEFAULT_CATEGORY = "__uncategorized__";

  private _onDidCloudPromptsChange = new vscode.EventEmitter<void>();
  readonly onDidCloudPromptsChange: vscode.Event<void> =
    this._onDidCloudPromptsChange.event;

  private _onDidCloudCategoriesChange = new vscode.EventEmitter<void>();
  readonly onDidCloudCategoriesChange: vscode.Event<void> =
    this._onDidCloudCategoriesChange.event;

  private cloudPrompts: Prompt[] = [];
  private cloudCategories: string[] = [];
  private initialized: boolean = false;

  constructor(
    private storageService: VscodeStorageService,
    private configService: ConfigurationService,
    private gitlabApiService: GitlabApiService
  ) {}

  /**
   * Initialize the service by loading stored cloud prompts.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.loadCloudPrompts();
    await this.loadCloudCategories();
    this.initialized = true;
  }

  /**
   * Get all currently stored cloud prompts.
   */
  public getCloudPrompts(): Prompt[] {
    return [...this.cloudPrompts];
  }

  /**
   * Get all currently stored cloud categories.
   */
  public getCloudCategories(): string[] {
    return [...this.cloudCategories];
  }

  /**
   * Get the default category ID for cloud items
   */
  public getDefaultCategoryId(): string {
    return CloudService.DEFAULT_CATEGORY;
  }

  /**
   * Parses the prompt data string and transforms it into MemoItems.
   * @param decodedContent The raw string content from GitLab.
   * @returns An object containing the parsed prompts structure and the transformed MemoItems array.
   * @throws If parsing or validation fails.
   */
  private _parseAndTransformPrompts(decodedContent: string): {
    promptsData: z.infer<typeof PromptsStructureSchema>;
    prompts: Omit<Prompt, "isCloud">[];
  } {
    const promptsData = parsePrompts(decodedContent);
    const now = Date.now();
    const items: Omit<Prompt, "isCloud">[] = [];

    Object.entries(promptsData).forEach(([categoryName, prompts]) => {
      Object.entries(prompts).forEach(([alias, promptObj]) => {
        const prompt = promptObj.content;
        const label = prompt.length > 30 ? `${prompt.slice(0, 30)}...` : prompt;
        const categoryId = categoryName;

        items.push({
          id: `cmd_${now}_${Math.random().toString().slice(2)}`,
          label,
          content: prompt,
          timestamp: now,
          alias,
          categoryId: categoryId,
        });
      });
    });
    return { promptsData, prompts: items };
  }

  /**
   * Fetches, decodes, parses, and validates team prompts from GitLab.
   * Does not update internal state.
   */
  private async fetchAndParseTeamPrompts(): Promise<
    CloudOperationResult<{ prompts: Prompt[]; categories: string[] }>
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
        const { promptsData, prompts } =
          this._parseAndTransformPrompts(decodedContent);
        const categories = Object.keys(promptsData);
        return {
          success: true,
          data: { prompts: prompts as Prompt[], categories },
        };
      } catch (parseError: any) {
        return {
          success: false,
          error: `Invalid prompt data: ${parseError.message}`,
        };
      }
    } catch (error) {
      if (error instanceof GitlabApiError && error.status === 401) {
        return { success: false, error: error.message, needsAuth: true };
      }
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error fetching team prompts";
      return { success: false, error: message };
    }
  }

  /**
   * Fetches all prompts from GitLab and updates the local cloud state.
   */
  public async syncAllFromGitLab(): Promise<
    CloudOperationResult<{ syncedPrompts: number }>
  > {
    const fetchResult = await this.fetchAndParseTeamPrompts();

    if (!fetchResult.success) {
      return fetchResult;
    }

    this.cloudPrompts = fetchResult.data.prompts.map((cmd) => ({
      ...cmd,
      isCloud: true,
    }));

    // Update cloud categories
    this.cloudCategories = fetchResult.data.categories;

    await this.saveCloudPrompts();
    await this.saveCloudCategories();

    this._onDidCloudPromptsChange.fire();
    this._onDidCloudCategoriesChange.fire();

    return {
      success: true,
      data: { syncedPrompts: this.cloudPrompts.length },
    };
  }

  /**
   * Fetches prompts from GitLab, filters by selected categories, and updates local cloud state.
   */
  public async syncSelectedFromGitLab(
    selectedCategories: string[]
  ): Promise<
    CloudOperationResult<{ syncedPrompts: number; deletedPrompts: number }>
  > {
    const fetchResult = await this.fetchAndParseTeamPrompts();

    if (!fetchResult.success) {
      return fetchResult;
    }

    // Get all prompts from GitLab
    const allGitlabPrompts: Prompt[] = fetchResult.data.prompts || [];

    // Convert GitLab prompts to cloud prompts
    const allGitlabCloudPrompts = allGitlabPrompts.map((cmd) => ({
      ...cmd,
      isCloud: true,
    }));

    // Keep only those local cloud commands that still exist in GitLab, regardless of category
    const existingPromptsToKeep = this.cloudPrompts.filter((localCmd) =>
      allGitlabPrompts.some((gitlabCmd) => isSamePrompt(localCmd, gitlabCmd))
    );

    // Calculate the number of deleted commands
    const deletedCount =
      this.cloudPrompts.length - existingPromptsToKeep.length;

    // Filter GitLab commands to only include user-selected categories
    const filteredGitlabPrompts = allGitlabCloudPrompts.filter((cmd) =>
      selectedCategories.includes(
        cmd.categoryId || CloudService.DEFAULT_CATEGORY
      )
    );

    // Filter out prompts that already exist in our keeper list
    const uniqueNewPrompts = filterOutDuplicates(
      filteredGitlabPrompts,
      existingPromptsToKeep
    );

    // Merge all commands: existing local commands + new commands from selected categories
    this.cloudPrompts = [...existingPromptsToKeep, ...uniqueNewPrompts];

    // Update cloud categories
    this.cloudCategories = [
      ...new Set([...this.cloudCategories, ...selectedCategories]),
    ];

    await this.saveCloudPrompts();
    await this.saveCloudCategories();

    this._onDidCloudPromptsChange.fire();
    this._onDidCloudCategoriesChange.fire();

    return {
      success: true,
      data: {
        syncedPrompts: uniqueNewPrompts.length,
        deletedPrompts: deletedCount,
      },
    };
  }

  /**
   * Fetches available categories from GitLab without updating local state.
   */
  public async fetchAvailableCategories(): Promise<
    CloudOperationResult<string[]>
  > {
    const fetchResult = await this.fetchAndParseTeamPrompts();
    if (!fetchResult.success) {
      return fetchResult;
    }
    return { success: true, data: fetchResult.data.categories || [] };
  }

  /**
   * Removes a cloud category and its associated prompts from the local cloud state.
   */
  public async removeCloudCategory(categoryName: string): Promise<{
    success: boolean;
    removedPrompts: number;
  }> {
    const originalLength = this.cloudPrompts.length;
    this.cloudPrompts = this.cloudPrompts.filter(
      (cmd) => cmd.categoryId !== categoryName
    );
    const removedCount = originalLength - this.cloudPrompts.length;

    // Remove from cloud categories list
    this.cloudCategories = this.cloudCategories.filter(
      (cat) => cat !== categoryName
    );

    if (removedCount > 0) {
      await this.saveCloudPrompts();
      await this.saveCloudCategories();
      this._onDidCloudPromptsChange.fire();
      this._onDidCloudCategoriesChange.fire();
      return { success: true, removedPrompts: removedCount };
    } else {
      // Even if no prompts were removed, the category might have been removed
      await this.saveCloudCategories();
      this._onDidCloudCategoriesChange.fire();
      return { success: true, removedPrompts: 0 };
    }
  }

  /**
   * Pushes specified prompts to GitLab by creating a merge request.
   * Merges provided prompts with the current remote state before pushing.
   * @param promptsToPush Array of MemoItems to add/update in GitLab.
   * @param involvedCategories List of category IDs/names involved (for commit/MR message).
   */
  public async pushPromptsToGitLab(
    promptsToPush: Prompt[],
    involvedCategories: string[]
  ): Promise<
    CloudOperationResult<{ mergeRequestUrl: string; pushedPrompts: number }>
  > {
    if (promptsToPush.length === 0) {
      return { success: false, error: "No prompts selected for pushing." };
    }

    try {
      // 1. Fetch current remote state
      const fetchResult = await this.fetchAndParseTeamPrompts();

      let remotePrompts: Prompt[] = [];
      if (fetchResult.success) {
        remotePrompts = fetchResult.data.prompts;
      } else if (fetchResult.needsAuth) {
        return fetchResult;
      } else if (fetchResult.error && !fetchResult.error.includes("404")) {
        return {
          success: false,
          error: `Failed to fetch remote state: ${fetchResult.error}`,
        };
      }

      // 2. Merge and prepare new content
      const allPrompts = [...remotePrompts, ...promptsToPush];
      const processedPrompts = allPrompts.map((cmd) => ({
        ...cmd,
        alias: cmd.alias || cmd.label,
      }));
      const uniquePrompts = removeDuplicatePrompts(processedPrompts);
      const promptsData = this._transformMemoItemsToStructure(uniquePrompts);
      const newFileContent = serializePrompts(promptsData);
      const newFileContentBase64 =
        Buffer.from(newFileContent).toString("base64");

      const newPromptsCount = uniquePrompts.length - remotePrompts.length;
      const updatedCount = promptsToPush.length - newPromptsCount;

      // 3. Create Branch
      const timestamp = new Date().toISOString().replace(/[:.-]/g, "_");
      const branchName = `cursor_memo_update_${timestamp}`;
      await this.gitlabApiService.createBranch(branchName);

      // 4. Commit File
      const filePath = this.configService.getGitlabFilePath();
      const commitMessage = `Update prompt content: added ${newPromptsCount} new, updated ${updatedCount}.`;
      await this.gitlabApiService.commitFileChange(
        branchName,
        filePath,
        newFileContentBase64,
        commitMessage
      );

      // 5. Create Merge Request
      const targetBranch = this.configService.getGitlabBranch();
      const mrTitle = `Update prompts from ${this.configService.getGitlabName()}`;
      const mrDescription = `This merge request adds ${newPromptsCount} new prompt(s) and updates ${updatedCount} existing prompt(s) from categories: ${involvedCategories.join(", ")}.`;
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
          pushedPrompts: promptsToPush.length,
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

  /**
   * Clears all locally stored cloud memos and categories.
   * @returns Promise that resolves when all data is cleared.
   */
  public async clearAllCloudData(): Promise<void> {
    this.cloudPrompts = [];
    this.cloudCategories = [];

    await this.saveCloudPrompts();
    await this.saveCloudCategories();

    this._onDidCloudPromptsChange.fire();
    this._onDidCloudCategoriesChange.fire();
  }

  private async saveCloudPrompts(): Promise<void> {
    await this.storageService.setValue(
      CloudService.CLOUD_PROMPTS_KEY,
      this.cloudPrompts
    );
  }

  private async loadCloudPrompts(): Promise<void> {
    const stored = this.storageService.getValue<Prompt[]>(
      CloudService.CLOUD_PROMPTS_KEY,
      []
    );
    this.cloudPrompts = stored.map((cmd: Prompt) => ({
      ...cmd,
      isCloud: true,
    }));
  }

  /**
   * Save cloud categories to storage
   */
  private async saveCloudCategories(): Promise<void> {
    await this.storageService.setValue(
      CloudService.CLOUD_CATEGORIES_KEY,
      this.cloudCategories
    );
  }

  /**
   * Load cloud categories from storage
   */
  private async loadCloudCategories(): Promise<void> {
    this.cloudCategories = this.storageService.getValue<string[]>(
      CloudService.CLOUD_CATEGORIES_KEY,
      []
    );

    // Ensure we also add any categories from the prompts
    const categoriesFromPrompts = new Set<string>();
    this.cloudPrompts.forEach((cmd) => {
      if (cmd.categoryId) {
        categoriesFromPrompts.add(cmd.categoryId);
      }
    });

    if (categoriesFromPrompts.size > 0) {
      this.cloudCategories = [
        ...new Set([...this.cloudCategories, ...categoriesFromPrompts]),
      ];
      await this.saveCloudCategories();
    }
  }

  /**
   * Transforms an array of MemoItems into the nested structure expected by GitLab/export format.
   * @param items The MemoItem array.
   * @returns The nested prompt structure.
   */
  private _transformMemoItemsToStructure(
    items: Prompt[]
  ): z.infer<typeof PromptsStructureSchema> {
    const result: z.infer<typeof PromptsStructureSchema> = {};

    items.forEach((item) => {
      const categoryName = item.categoryId;
      const alias = item.alias || item.label || "Unnamed Prompt";

      if (!result[categoryName]) {
        result[categoryName] = {};
      }

      if (!result[categoryName][alias]) {
        result[categoryName][alias] = {
          content: item.content,
        };
      }
    });

    return result;
  }
}
