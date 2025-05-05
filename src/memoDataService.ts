/** @format */

import * as vscode from "vscode";
import { GitlabClient } from "./gitlab";

/**
 * Data structure for memo items
 */
export interface MemoItem {
  id: string;
  label: string;
  command: string;
  timestamp: number;
  alias?: string;
  category: string;
  isCloud?: boolean;
}

/**
 * Data service for memo items
 */
export class MemoDataService {
  private static STORAGE_KEY = "cursor-memo-commands";
  private static CATEGORIES_KEY = "cursor-memo-categories";
  private static CLOUD_COMMANDS_KEY = "cursor-memo-cloud-commands";
  private static DEFAULT_CATEGORY = "default";

  private commands: MemoItem[] = [];
  private cloudCommands: MemoItem[] = [];
  private categories: string[] = [];
  private initialized: boolean = false;
  private gitlabClient: GitlabClient;

  /**
   * Constructor
   * @param context VSCode extension context for accessing global state storage
   */
  constructor(private context: vscode.ExtensionContext) {
    this.gitlabClient = new GitlabClient(context);
  }

  /**
   * Initialize the data service
   * Loads commands and categories from global state
   * Ensures all commands have a category field and the default category exists
   * @returns Promise that resolves when initialization is complete
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const storedCommands = this.context.globalState.get<MemoItem[]>(
      MemoDataService.STORAGE_KEY,
      []
    );

    this.commands = storedCommands.map((cmd) => {
      if (!cmd.category) {
        return { ...cmd, category: MemoDataService.DEFAULT_CATEGORY };
      }
      return cmd;
    });

    if (JSON.stringify(storedCommands) !== JSON.stringify(this.commands)) {
      await this.saveCommands();
    }

    this.cloudCommands = this.context.globalState.get<MemoItem[]>(
      MemoDataService.CLOUD_COMMANDS_KEY,
      []
    );

    this.categories = this.context.globalState.get<string[]>(
      MemoDataService.CATEGORIES_KEY,
      []
    );

    if (!this.categories.includes(MemoDataService.DEFAULT_CATEGORY)) {
      this.categories.push(MemoDataService.DEFAULT_CATEGORY);
      await this.saveCategories();
    }

    this.initialized = true;
  }

  /**
   * Get all commands
   * Returns a copy of the commands array to maintain encapsulation of internal state
   * @returns Array of all commands
   */
  public getCommands(): MemoItem[] {
    return [...this.commands];
  }

  /**
   * Get all cloud commands
   * Returns a copy of the cloud commands array
   * @returns Array of all cloud commands
   */
  public getCloudCommands(): MemoItem[] {
    return [...this.cloudCommands];
  }

  /**
   * Get all categories
   * Returns a copy of the categories array to maintain encapsulation of internal state
   * @returns Array of all categories
   */
  public getCategories(): string[] {
    return [...this.categories];
  }

  /**
   * Get the default category name
   * @returns The name of the default category
   */
  public getDefaultCategory(): string {
    return MemoDataService.DEFAULT_CATEGORY;
  }

  /**
   * Add a new command
   * @param command The command content
   * @param category The category the command belongs to, defaults to the default category
   * @returns Promise containing the newly added command item
   */
  public async addCommand(
    command: string,
    category: string = MemoDataService.DEFAULT_CATEGORY
  ): Promise<MemoItem> {
    const newItem: MemoItem = {
      id: Date.now().toString(),
      label: command.length > 30 ? `${command.slice(0, 30)}...` : command,
      command: command,
      timestamp: Date.now(),
      category: category,
    };

    this.commands = [...this.commands, newItem];
    await this.saveCommands();
    return newItem;
  }

  /**
   * Remove a command
   * @param id The ID of the command to remove
   * @returns Promise<boolean> Whether the operation was successful
   */
  public async removeCommand(id: string): Promise<boolean> {
    const originalLength = this.commands.length;
    this.commands = this.commands.filter((cmd) => cmd.id !== id);

    if (this.commands.length !== originalLength) {
      await this.saveCommands();
      return true;
    }
    return false;
  }

  /**
   * Rename a command (set alias)
   * @param id The ID of the command to rename
   * @param alias The new alias
   * @returns Promise<boolean> Whether the operation was successful
   */
  public async renameCommand(id: string, alias: string): Promise<boolean> {
    let updated = false;

    this.commands = this.commands.map((cmd) => {
      if (cmd.id === id) {
        updated = true;
        return { ...cmd, alias };
      }
      return cmd;
    });

    if (updated) {
      await this.saveCommands();
      return true;
    }
    return false;
  }

  /**
   * Edit command content
   * @param id The ID of the command to edit
   * @param newCommand The new command content
   * @returns Promise<boolean> Whether the operation was successful
   */
  public async editCommand(id: string, newCommand: string): Promise<boolean> {
    let updated = false;

    this.commands = this.commands.map((cmd) => {
      if (cmd.id === id) {
        updated = true;
        const newLabel =
          newCommand.length > 30 ? `${newCommand.slice(0, 30)}...` : newCommand;

        return {
          ...cmd,
          command: newCommand,

          label: cmd.alias ? cmd.label : newLabel,
        };
      }
      return cmd;
    });

    if (updated) {
      await this.saveCommands();
      return true;
    }
    return false;
  }

  /**
   * Add a new category
   * @param categoryName The name of the category to add
   * @returns Promise<boolean> Whether the operation was successful
   */
  public async addCategory(categoryName: string): Promise<boolean> {
    if (!categoryName || this.categories.includes(categoryName)) {
      return false;
    }

    this.categories.push(categoryName);
    await this.saveCategories();
    return true;
  }

  /**
   * Delete a category
   * Moves all commands in this category to the default category
   * @param categoryName The name of the category to delete
   * @returns Promise containing the operation result and number of moved commands
   */
  public async deleteCategory(
    categoryName: string
  ): Promise<{ success: boolean; commandsMoved: number }> {
    if (
      !categoryName ||
      categoryName === MemoDataService.DEFAULT_CATEGORY ||
      !this.categories.includes(categoryName)
    ) {
      return { success: false, commandsMoved: 0 };
    }

    let commandsMoved = 0;

    this.commands = this.commands.map((cmd) => {
      if (cmd.category === categoryName) {
        commandsMoved++;
        return { ...cmd, category: MemoDataService.DEFAULT_CATEGORY };
      }
      return cmd;
    });

    this.categories = this.categories.filter((cat) => cat !== categoryName);

    await Promise.all([this.saveCommands(), this.saveCategories()]);

    return { success: true, commandsMoved };
  }

  /**
   * Rename a category
   * Also updates the category of all commands in the category
   * @param oldName The original category name
   * @param newName The new category name
   * @returns Promise<boolean> Whether the operation was successful
   */
  public async renameCategory(
    oldName: string,
    newName: string
  ): Promise<boolean> {
    if (
      !oldName ||
      !newName ||
      oldName === MemoDataService.DEFAULT_CATEGORY ||
      this.categories.includes(newName)
    ) {
      return false;
    }

    if (!this.categories.includes(oldName)) {
      return false;
    }

    this.categories = this.categories.map((cat) =>
      cat === oldName ? newName : cat
    );

    this.commands = this.commands.map((cmd) => {
      if (cmd.category === oldName) {
        return { ...cmd, category: newName };
      }
      return cmd;
    });

    await Promise.all([this.saveCommands(), this.saveCategories()]);
    return true;
  }

  /**
   * Move a command to a different category
   * @param commandId The ID of the command to move
   * @param targetCategory The category to move the command to
   * @returns Promise<boolean> Whether the operation was successful
   */
  public async moveCommandToCategory(
    commandId: string,
    targetCategory: string
  ): Promise<boolean> {
    if (!this.categories.includes(targetCategory)) {
      return false;
    }

    let updated = false;

    this.commands = this.commands.map((cmd) => {
      if (cmd.id === commandId) {
        updated = true;
        return { ...cmd, category: targetCategory };
      }
      return cmd;
    });

    if (updated) {
      await this.saveCommands();
      return true;
    }
    return false;
  }

  /**
   * Export all data as JSON string
   * @returns JSON string of all commands and categories
   */
  public exportData(): string {
    return JSON.stringify({
      commands: this.commands,
      categories: this.categories,
    });
  }

  /**
   * Export selected categories as JSON string
   * @param selectedCategories Array of category names to export
   * @returns JSON string of selected categories and their commands
   */
  public exportSelectedCategories(selectedCategories: string[]): string {
    const filteredCommands = this.commands.filter((cmd) =>
      selectedCategories.includes(cmd.category)
    );

    return JSON.stringify({
      commands: filteredCommands,
      categories: selectedCategories,
    });
  }

  /**
   * Import data from JSON string
   * @param jsonData JSON string of commands and categories
   * @returns Promise with result of import operation
   */
  public async importData(jsonData: string): Promise<{
    success: boolean;
    importedCommands: number;
    importedCategories: number;
  }> {
    try {
      const data = JSON.parse(jsonData);
      const importedCommands: MemoItem[] = data.commands || [];
      const importedCategories: string[] = data.categories || [];

      // Validate imported data
      const validCommands = importedCommands.filter(
        (cmd) =>
          typeof cmd === "object" &&
          cmd !== null &&
          typeof cmd.command === "string" &&
          typeof cmd.id === "string"
      );

      // Process categories
      const newCategories = importedCategories.filter(
        (cat) =>
          typeof cat === "string" &&
          cat.trim() !== "" &&
          !this.categories.includes(cat)
      );

      if (newCategories.length > 0) {
        this.categories = [...this.categories, ...newCategories];
        await this.saveCategories();
      }

      // Process commands with proper IDs
      const now = Date.now();
      const processedCommands = validCommands.map((cmd) => {
        const label =
          cmd.label ||
          (cmd.command.length > 30
            ? `${cmd.command.slice(0, 30)}...`
            : cmd.command);

        return {
          ...cmd,
          id: `${cmd.id}_imported_${now}`,
          label: label,
          timestamp: cmd.timestamp || now,
          category: this.categories.includes(cmd.category)
            ? cmd.category
            : MemoDataService.DEFAULT_CATEGORY,
        };
      });

      if (processedCommands.length > 0) {
        this.commands = [...this.commands, ...processedCommands];
        await this.saveCommands();
      }

      return {
        success: true,
        importedCommands: processedCommands.length,
        importedCategories: newCategories.length,
      };
    } catch (error) {
      console.error("Import error:", error);
      return {
        success: false,
        importedCommands: 0,
        importedCategories: 0,
      };
    }
  }

  /**
   * Import selected categories from JSON string
   * @param jsonData JSON string of commands and categories
   * @param selectedCategories Array of category names to import
   * @returns Promise with result of import operation
   */
  public async importSelectedData(
    jsonData: string,
    selectedCategories: string[]
  ): Promise<{
    success: boolean;
    importedCommands: number;
    importedCategories: number;
  }> {
    try {
      const data = JSON.parse(jsonData);
      const allImportedCommands: MemoItem[] = data.commands || [];
      const allImportedCategories: string[] = data.categories || [];

      // Filter commands by selected categories
      const importedCommands = allImportedCommands.filter((cmd) =>
        selectedCategories.includes(cmd.category)
      );

      // Filter categories to only include selected ones
      const importedCategories = allImportedCategories.filter((cat) =>
        selectedCategories.includes(cat)
      );

      // Validate imported data
      const validCommands = importedCommands.filter(
        (cmd) =>
          typeof cmd === "object" &&
          cmd !== null &&
          typeof cmd.command === "string" &&
          typeof cmd.id === "string"
      );

      // Process categories
      const newCategories = importedCategories.filter(
        (cat) =>
          typeof cat === "string" &&
          cat.trim() !== "" &&
          !this.categories.includes(cat)
      );

      if (newCategories.length > 0) {
        this.categories = [...this.categories, ...newCategories];
        await this.saveCategories();
      }

      // Process commands with proper IDs
      const now = Date.now();
      const processedCommands = validCommands.map((cmd) => {
        const label =
          cmd.label ||
          (cmd.command.length > 30
            ? `${cmd.command.slice(0, 30)}...`
            : cmd.command);

        return {
          ...cmd,
          id: `${cmd.id}_imported_${now}`,
          label: label,
          timestamp: cmd.timestamp || now,
          category: this.categories.includes(cmd.category)
            ? cmd.category
            : MemoDataService.DEFAULT_CATEGORY,
        };
      });

      if (processedCommands.length > 0) {
        this.commands = [...this.commands, ...processedCommands];
        await this.saveCommands();
      }

      return {
        success: true,
        importedCommands: processedCommands.length,
        importedCategories: newCategories.length,
      };
    } catch (error) {
      console.error("Import error:", error);
      return {
        success: false,
        importedCommands: 0,
        importedCategories: 0,
      };
    }
  }

  /**
   * Synchronize commands from GitLab
   * Fetches commands from a specified GitLab repository and updates cloud commands
   * @returns Promise with synchronization result
   */
  public async syncFromGitLab(): Promise<{
    success: boolean;
    syncedCommands: number;
  }> {
    try {
      const result = await this.gitlabClient.fetchTeamCommands();

      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch data from GitLab");
      }

      const importedCommands: MemoItem[] = result.data.commands || [];

      // Process commands and mark them as cloud commands
      const now = Date.now();
      this.cloudCommands = importedCommands.map((cmd) => {
        const label =
          cmd.label ||
          (cmd.command.length > 30
            ? `${cmd.command.slice(0, 30)}...`
            : cmd.command);

        return {
          ...cmd,
          id: `cloud_${cmd.id || now.toString()}`,
          label: label,
          timestamp: cmd.timestamp || now,
          category: cmd.category || MemoDataService.DEFAULT_CATEGORY,
          isCloud: true,
        };
      });

      await this.saveCloudCommands();

      return {
        success: true,
        syncedCommands: this.cloudCommands.length,
      };
    } catch (error) {
      console.error("GitLab sync error:", error);
      return {
        success: false,
        syncedCommands: 0,
      };
    }
  }

  /**
   * Synchronize selected categories from GitLab
   * Fetches commands from a specified GitLab repository and updates cloud commands
   * @param selectedCategories Array of category names to sync
   * @returns Promise with synchronization result
   */
  public async syncSelectedFromGitLab(selectedCategories: string[]): Promise<{
    success: boolean;
    syncedCommands: number;
  }> {
    try {
      const result = await this.gitlabClient.fetchTeamCommands();

      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch data from GitLab");
      }

      const allImportedCommands: MemoItem[] = result.data.commands || [];

      // Filter commands by selected categories
      const importedCommands = allImportedCommands.filter((cmd) =>
        selectedCategories.includes(
          cmd.category || MemoDataService.DEFAULT_CATEGORY
        )
      );

      // Process commands and mark them as cloud commands
      const now = Date.now();
      this.cloudCommands = importedCommands.map((cmd) => {
        const label =
          cmd.label ||
          (cmd.command.length > 30
            ? `${cmd.command.slice(0, 30)}...`
            : cmd.command);

        return {
          ...cmd,
          id: `cloud_${cmd.id || now.toString()}`,
          label: label,
          timestamp: cmd.timestamp || now,
          category: cmd.category || MemoDataService.DEFAULT_CATEGORY,
          isCloud: true,
        };
      });

      await this.saveCloudCommands();

      return {
        success: true,
        syncedCommands: this.cloudCommands.length,
      };
    } catch (error) {
      console.error("GitLab sync error:", error);
      return {
        success: false,
        syncedCommands: 0,
      };
    }
  }

  /**
   * Remove cloud category from local storage
   * Only removes the category and its commands from local storage, doesn't affect cloud data
   * @param categoryName Name of the cloud category to remove locally
   * @returns Promise with removal result
   */
  public async removeCloudCategory(categoryName: string): Promise<{
    success: boolean;
    removedCommands: number;
  }> {
    // Count the number of commands in this category
    const categoryCommands = this.cloudCommands.filter(
      (cmd) => cmd.category === categoryName
    );
    const commandCount = categoryCommands.length;

    // Remove all commands from this cloud category
    this.cloudCommands = this.cloudCommands.filter(
      (cmd) => cmd.category !== categoryName
    );

    // Save the updated cloud commands
    await this.saveCloudCommands();

    return {
      success: true,
      removedCommands: commandCount,
    };
  }

  /**
   * Clear GitLab token
   * Removes the stored GitLab token, requiring re-authentication for future GitLab operations
   */
  public async clearGitLabToken(): Promise<void> {
    await this.gitlabClient.clearToken();
  }

  /**
   * Save commands to global state
   * @returns Promise that resolves when commands have been saved
   */
  private async saveCommands(): Promise<void> {
    await this.context.globalState.update(
      MemoDataService.STORAGE_KEY,
      this.commands
    );
  }

  /**
   * Save cloud commands to global state
   * @returns Promise that resolves when cloud commands have been saved
   */
  private async saveCloudCommands(): Promise<void> {
    await this.context.globalState.update(
      MemoDataService.CLOUD_COMMANDS_KEY,
      this.cloudCommands
    );
  }

  /**
   * Save categories to global state
   * @returns Promise that resolves when categories have been saved
   */
  private async saveCategories(): Promise<void> {
    await this.context.globalState.update(
      MemoDataService.CATEGORIES_KEY,
      this.categories
    );
  }
}
