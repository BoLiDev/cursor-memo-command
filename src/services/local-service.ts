/** @format */

import * as vscode from "vscode";
import { MemoItem } from "../models/memo-item";
import { Category } from "../models/category";
import { VscodeStorageService } from "./vscode-storage-service";

/**
 * Service for managing local memo items and categories.
 */
export class LocalService {
  private static STORAGE_KEY = "cursor-memo-commands";
  private static CATEGORIES_KEY = "cursor-memo-categories";
  private static DEFAULT_CATEGORY = "Default";

  private commands: MemoItem[] = [];
  private categories: Category[] = [];
  private initialized: boolean = false;

  private _onDidCommandsChange = new vscode.EventEmitter<void>();
  readonly onDidCommandsChange: vscode.Event<void> =
    this._onDidCommandsChange.event;

  private _onDidCategoriesChange = new vscode.EventEmitter<void>();
  readonly onDidCategoriesChange: vscode.Event<void> =
    this._onDidCategoriesChange.event;

  /**
   * Constructor
   * @param storageService Instance of StorageService for accessing stored data
   */
  constructor(private storageService: VscodeStorageService) {}

  /**
   * Initialize the local data service
   * Loads local commands and categories from global state
   * Ensures all commands have a category field and the default category exists
   * Cleans up corrupted category data and remaps affected commands.
   * @returns Promise that resolves when initialization is complete
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 1. Load commands and fix missing categoryId
    const storedCommands = this.storageService.getValue<MemoItem[]>(
      LocalService.STORAGE_KEY,
      []
    );
    let commandsInitiallyModified = false;
    this.commands = storedCommands.map((cmd) => {
      if (!cmd.categoryId?.trim()) {
        // Check for null, undefined, or empty categoryId
        commandsInitiallyModified = true;
        return { ...cmd, categoryId: LocalService.DEFAULT_CATEGORY };
      }
      return cmd;
    });

    if (commandsInitiallyModified) {
      await this.saveCommands();
    }

    // 2. Load categories
    const storedCategories = this.storageService.getValue<Category[]>(
      LocalService.CATEGORIES_KEY,
      []
    );

    // 3. Clean categories
    const pristineCategories: Category[] = [];
    const corruptedCategorySourceIds = new Set<string>();
    let categoriesListChangedDuringCleanup = false;

    for (const category of storedCategories) {
      const isDefaultCandidateById =
        category.id === LocalService.DEFAULT_CATEGORY;
      const isCorrupted = !category.id?.trim() || !category.name?.trim();

      if (isCorrupted) {
        categoriesListChangedDuringCleanup = true; // Mark that original list is different
        if (!isDefaultCandidateById && category.id?.trim()) {
          // If it's a corrupted non-Default category with a somewhat valid original ID, record it for command migration.
          corruptedCategorySourceIds.add(category.id.trim());
        }
        // Corrupted categories (including a corrupted Default) are not added to pristineCategories at this stage.
        // Default category will be handled specifically later.
      } else {
        pristineCategories.push(category);
      }
    }
    this.categories = pristineCategories; // Start with a list of non-corrupted categories

    // 4. Migrate commands from corrupted categories
    let commandsRemappedDuringCleanup = false;
    if (corruptedCategorySourceIds.size > 0) {
      const remappedCommands = this.commands.map((cmd) => {
        if (cmd.categoryId && corruptedCategorySourceIds.has(cmd.categoryId)) {
          commandsRemappedDuringCleanup = true;
          return { ...cmd, categoryId: LocalService.DEFAULT_CATEGORY };
        }
        return cmd;
      });
      if (commandsRemappedDuringCleanup) {
        this.commands = remappedCommands;
      }
    }

    // 5. Ensure Default Category exists and is pristine
    let defaultCategoryHandled = false;
    const defaultCategoryIndex = this.categories.findIndex(
      (cat) => cat.id === LocalService.DEFAULT_CATEGORY
    );

    if (defaultCategoryIndex === -1) {
      // Default category is completely missing, add it.
      this.categories.push({
        id: LocalService.DEFAULT_CATEGORY,
        name: LocalService.DEFAULT_CATEGORY,
      });
      defaultCategoryHandled = true;
    } else {
      // Default category exists, ensure its name is also "Default".
      if (
        this.categories[defaultCategoryIndex].name !==
        LocalService.DEFAULT_CATEGORY
      ) {
        this.categories[defaultCategoryIndex].name =
          LocalService.DEFAULT_CATEGORY;
        defaultCategoryHandled = true;
      }
    }

    const finalCategoriesChanged =
      categoriesListChangedDuringCleanup || defaultCategoryHandled;

    // 6. Save changes
    if (finalCategoriesChanged) {
      await this.saveCategories();
    }

    if (commandsRemappedDuringCleanup) {
      // Only save if remapped during this cleanup phase
      await this.saveCommands();
    }

    // 7. Fire events if data changed, so UI can update
    if (finalCategoriesChanged) {
      this._onDidCategoriesChange.fire();
    }
    // Fire if commands were modified either initially or during the cleanup
    if (commandsInitiallyModified || commandsRemappedDuringCleanup) {
      this._onDidCommandsChange.fire();
    }

    // 8. Mark initialization complete
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
  public getCategories(): Category[] {
    return [...this.categories];
  }

  /**
   * Get the default category name
   * @returns The name of the default category
   * @deprecated Prefer getDefaultCategoryId
   */
  public getDefaultCategory(): string {
    return LocalService.DEFAULT_CATEGORY;
  }

  /**
   * Get the ID of the default category
   * @returns The ID of the default category
   */
  public getDefaultCategoryId(): string {
    return LocalService.DEFAULT_CATEGORY;
  }

  /**
   * Add a new local command
   * @param command The command content
   * @param categoryId The ID of the category the command belongs to, defaults to the default category ID
   * @returns Promise containing the newly added command item
   */
  public async addCommand(
    command: string,
    categoryId: string = this.getDefaultCategoryId()
  ): Promise<MemoItem> {
    if (!this.categories.some((cat) => cat.id === categoryId)) {
      categoryId = this.getDefaultCategoryId();
    }

    const newItem: MemoItem = {
      id: Date.now().toString(),
      label: command.length > 30 ? `${command.slice(0, 30)}...` : command,
      command: command,
      timestamp: Date.now(),
      categoryId: categoryId,
      isCloud: false,
    };

    this.commands = [...this.commands, newItem];
    await this.saveCommands();
    this._onDidCommandsChange.fire();
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
      categoryId: this.categories.some((cat) => cat.id === cmd.categoryId)
        ? cmd.categoryId
        : this.getDefaultCategoryId(),
      isCloud: false,
    }));
    this.commands = [...this.commands, ...localNewCommands];
    await this.saveCommands();
    if (localNewCommands.length > 0) {
      this._onDidCommandsChange.fire();
    }
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
      this._onDidCommandsChange.fire();
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
      this._onDidCommandsChange.fire();
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
      this._onDidCommandsChange.fire();
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
    if (!trimmedName || this.categories.some((cat) => cat.id === trimmedName)) {
      return false;
    }

    const newCategory: Category = { id: trimmedName, name: trimmedName };
    this.categories.push(newCategory);
    await this.saveCategories();
    this._onDidCategoriesChange.fire();
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
      .filter(
        (catName) =>
          catName && !this.categories.some((cat) => cat.id === catName)
      )
      .map((catName) => ({ id: catName, name: catName }) as Category);

    if (uniqueNewCategories.length > 0) {
      this.categories.push(...uniqueNewCategories);
      await this.saveCategories();
      this._onDidCategoriesChange.fire();
      return true;
    }
    return false;
  }

  /**
   * Delete a local category
   * Moves all commands in this category to the default category
   * @param categoryId The ID of the category to delete
   * @returns Promise containing the operation result and number of moved commands
   */
  public async deleteCategory(
    categoryId: string
  ): Promise<{ success: boolean; commandsMoved: number }> {
    if (
      !categoryId ||
      categoryId === this.getDefaultCategoryId() ||
      !this.categories.some((cat) => cat.id === categoryId)
    ) {
      return { success: false, commandsMoved: 0 };
    }

    let commandsMoved = 0;
    const defaultCategoryId = this.getDefaultCategoryId();

    this.commands = this.commands.map((cmd) => {
      if (cmd.categoryId === categoryId) {
        commandsMoved++;
        return { ...cmd, categoryId: defaultCategoryId };
      }
      return cmd;
    });

    this.categories = this.categories.filter((cat) => cat.id !== categoryId);

    const savePromises: Promise<void>[] = [];
    if (commandsMoved > 0) {
      savePromises.push(this.saveCommands());
    }
    savePromises.push(this.saveCategories());

    await Promise.all(savePromises);

    if (commandsMoved > 0) {
      this._onDidCommandsChange.fire();
    }
    this._onDidCategoriesChange.fire();

    return { success: true, commandsMoved };
  }

  /**
   * Rename a local category
   * Also updates the category of all commands in the category
   * @param categoryId The ID of the category to rename
   * @param newName The new category name
   * @returns Promise<boolean> Whether the operation was successful
   */
  public async renameCategory(
    categoryId: string,
    newName: string
  ): Promise<boolean> {
    const trimmedNewName = newName?.trim();
    const categoryToRename = this.categories.find(
      (cat) => cat.id === categoryId
    );

    if (
      !categoryToRename ||
      !trimmedNewName ||
      categoryId === this.getDefaultCategoryId() ||
      this.categories.some(
        (cat) => cat.id !== categoryId && cat.name === trimmedNewName
      )
    ) {
      return false;
    }

    let categoryUpdated = false;
    this.categories = this.categories.map((cat) => {
      if (cat.id === categoryId) {
        categoryUpdated = true;
        return { ...cat, id: trimmedNewName, name: trimmedNewName };
      }
      return cat;
    });

    let commandsUpdated = false;
    this.commands = this.commands.map((cmd) => {
      if (cmd.categoryId === categoryId) {
        commandsUpdated = true;
        return { ...cmd, categoryId: trimmedNewName };
      }
      return cmd;
    });

    const promises = [];
    const needsCommandSave = commandsUpdated;
    const needsCategorySave = categoryUpdated;

    if (needsCommandSave) promises.push(this.saveCommands());
    if (needsCategorySave) promises.push(this.saveCategories());

    if (promises.length > 0) {
      await Promise.all(promises);
      if (needsCommandSave) this._onDidCommandsChange.fire();
      if (needsCategorySave) this._onDidCategoriesChange.fire();
      return true;
    }

    return false;
  }

  /**
   * Move a local command to a different local category
   * @param commandId The ID of the command to move
   * @param targetCategoryId The ID of the category to move the command to
   * @returns Promise<boolean> Whether the operation was successful
   */
  public async moveCommandToCategory(
    commandId: string,
    targetCategoryId: string
  ): Promise<boolean> {
    if (!this.categories.some((cat) => cat.id === targetCategoryId)) {
      return false;
    }

    let updated = false;
    this.commands = this.commands.map((cmd) => {
      if (cmd.id === commandId && cmd.categoryId !== targetCategoryId) {
        updated = true;
        return { ...cmd, categoryId: targetCategoryId };
      }
      return cmd;
    });

    if (updated) {
      await this.saveCommands();
      this._onDidCommandsChange.fire();
      return true;
    }
    return false;
  }

  /**
   * Save local commands to global state
   * @returns Promise that resolves when commands have been saved
   */
  private async saveCommands(): Promise<void> {
    await this.storageService.setValue(LocalService.STORAGE_KEY, this.commands);
  }

  /**
   * Save local categories to global state
   * @returns Promise that resolves when categories have been saved
   */
  private async saveCategories(): Promise<void> {
    await this.storageService.setValue<Category[]>(
      LocalService.CATEGORIES_KEY,
      this.categories
    );
  }

  /**
   * Clears all local memos and categories, then re-initializes the default category.
   * @returns Promise that resolves when all data is cleared and default category is saved.
   */
  public async clearAllLocalData(): Promise<void> {
    this.commands = [];
    this.categories = [
      {
        id: LocalService.DEFAULT_CATEGORY,
        name: LocalService.DEFAULT_CATEGORY,
      },
    ];

    await this.saveCommands();
    await this.saveCategories();

    this._onDidCommandsChange.fire();
    this._onDidCategoriesChange.fire();
  }
}
