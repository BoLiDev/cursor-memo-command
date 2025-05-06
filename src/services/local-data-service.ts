/** @format */

import * as vscode from "vscode";
import { MemoItem } from "../models/memo-item";
import { StorageService } from "./storage-service";

/**
 * Service for managing local memo items and categories.
 */
export class LocalMemoService {
  private static STORAGE_KEY = "cursor-memo-commands";
  private static CATEGORIES_KEY = "cursor-memo-categories";
  private static DEFAULT_CATEGORY = "Default";

  private commands: MemoItem[] = [];
  private categories: string[] = [];
  private initialized: boolean = false;

  /**
   * Constructor
   * @param storageService Instance of StorageService for accessing stored data
   */
  constructor(private storageService: StorageService) {}

  /**
   * Initialize the local data service
   * Loads local commands and categories from global state
   * Ensures all commands have a category field and the default category exists
   * @returns Promise that resolves when initialization is complete
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const storedCommands = this.storageService.getValue<MemoItem[]>(
      LocalMemoService.STORAGE_KEY,
      []
    );

    this.commands = storedCommands.map((cmd) => {
      if (!cmd.category) {
        return { ...cmd, category: LocalMemoService.DEFAULT_CATEGORY };
      }
      return cmd;
    });

    if (JSON.stringify(storedCommands) !== JSON.stringify(this.commands)) {
      await this.saveCommands();
    }

    this.categories = this.storageService.getValue<string[]>(
      LocalMemoService.CATEGORIES_KEY,
      []
    );

    if (!this.categories.includes(LocalMemoService.DEFAULT_CATEGORY)) {
      this.categories.push(LocalMemoService.DEFAULT_CATEGORY);
      await this.saveCategories();
    }

    this.initialized = true;
  }

  /**
   * Get all local commands
   * Returns a copy of the commands array
   * @returns Array of all local commands
   */
  public getCommands(): MemoItem[] {
    return [...this.commands];
  }

  /**
   * Get all local categories
   * Returns a copy of the categories array
   * @returns Array of all local categories
   */
  public getCategories(): string[] {
    return [...this.categories];
  }

  /**
   * Get the default category name
   * @returns The name of the default category
   */
  public getDefaultCategory(): string {
    return LocalMemoService.DEFAULT_CATEGORY;
  }

  /**
   * Add a new local command
   * @param command The command content
   * @param category The category the command belongs to, defaults to the default category
   * @returns Promise containing the newly added command item
   */
  public async addCommand(
    command: string,
    category: string = LocalMemoService.DEFAULT_CATEGORY
  ): Promise<MemoItem> {
    const newItem: MemoItem = {
      id: Date.now().toString(),
      label: command.length > 30 ? `${command.slice(0, 30)}...` : command,
      command: command,
      timestamp: Date.now(),
      category: category,
      isCloud: false, // Explicitly mark as local
    };

    this.commands = [...this.commands, newItem];
    await this.saveCommands();
    return newItem;
  }

  /**
   * Add multiple local commands
   * @param newCommands Array of command items to add
   * @returns Promise that resolves when commands are added
   */
  public async addCommands(newCommands: MemoItem[]): Promise<void> {
    const localNewCommands = newCommands.map((cmd) => ({
      ...cmd,
      isCloud: false,
    }));
    this.commands = [...this.commands, ...localNewCommands];
    await this.saveCommands();
  }

  /**
   * Remove a local command
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
   * Rename a local command (set alias)
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
   * Edit local command content
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
   * Add a new local category
   * @param categoryName The name of the category to add
   * @returns Promise<boolean> Whether the operation was successful
   */
  public async addCategory(categoryName: string): Promise<boolean> {
    const trimmedName = categoryName?.trim();
    if (!trimmedName || this.categories.includes(trimmedName)) {
      return false;
    }

    this.categories.push(trimmedName);
    await this.saveCategories();
    return true;
  }

  /**
   * Add multiple local categories
   * @param categoryNames Array of category names to add
   * @returns Promise<boolean> Whether the operation was successful (all unique new ones added)
   */
  public async addCategories(categoryNames: string[]): Promise<boolean> {
    const uniqueNewCategories = categoryNames
      .map((cat) => cat?.trim())
      .filter((cat) => cat && !this.categories.includes(cat));

    if (uniqueNewCategories.length > 0) {
      this.categories.push(...uniqueNewCategories);
      await this.saveCategories();
      return true;
    }
    return false;
  }

  /**
   * Delete a local category
   * Moves all commands in this category to the default category
   * @param categoryName The name of the category to delete
   * @returns Promise containing the operation result and number of moved commands
   */
  public async deleteCategory(
    categoryName: string
  ): Promise<{ success: boolean; commandsMoved: number }> {
    if (
      !categoryName ||
      categoryName === LocalMemoService.DEFAULT_CATEGORY ||
      !this.categories.includes(categoryName)
    ) {
      return { success: false, commandsMoved: 0 };
    }

    let commandsMoved = 0;

    this.commands = this.commands.map((cmd) => {
      if (cmd.category === categoryName) {
        commandsMoved++;
        return { ...cmd, category: LocalMemoService.DEFAULT_CATEGORY };
      }
      return cmd;
    });

    this.categories = this.categories.filter((cat) => cat !== categoryName);

    await Promise.all([
      commandsMoved > 0 ? this.saveCommands() : Promise.resolve(),
      this.saveCategories(),
    ]);

    return { success: true, commandsMoved };
  }

  /**
   * Rename a local category
   * Also updates the category of all commands in the category
   * @param oldName The original category name
   * @param newName The new category name
   * @returns Promise<boolean> Whether the operation was successful
   */
  public async renameCategory(
    oldName: string,
    newName: string
  ): Promise<boolean> {
    const trimmedNewName = newName?.trim();
    if (
      !oldName ||
      !trimmedNewName ||
      oldName === LocalMemoService.DEFAULT_CATEGORY ||
      this.categories.includes(trimmedNewName) ||
      !this.categories.includes(oldName)
    ) {
      return false;
    }

    let categoryUpdated = false;
    this.categories = this.categories.map((cat) => {
      if (cat === oldName) {
        categoryUpdated = true;
        return trimmedNewName;
      }
      return cat;
    });

    let commandsUpdated = false;
    this.commands = this.commands.map((cmd) => {
      if (cmd.category === oldName) {
        commandsUpdated = true;
        return { ...cmd, category: trimmedNewName };
      }
      return cmd;
    });

    const promises = [];
    if (commandsUpdated) promises.push(this.saveCommands());
    if (categoryUpdated) promises.push(this.saveCategories());

    if (promises.length > 0) {
      await Promise.all(promises);
      return true;
    }

    return false;
  }

  /**
   * Move a local command to a different local category
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
      if (cmd.id === commandId && cmd.category !== targetCategory) {
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
   * Save local commands to global state
   * @returns Promise that resolves when commands have been saved
   */
  private async saveCommands(): Promise<void> {
    await this.storageService.setValue(
      LocalMemoService.STORAGE_KEY,
      this.commands
    );
  }

  /**
   * Save local categories to global state
   * @returns Promise that resolves when categories have been saved
   */
  private async saveCategories(): Promise<void> {
    await this.storageService.setValue(
      LocalMemoService.CATEGORIES_KEY,
      this.categories
    );
  }
}
