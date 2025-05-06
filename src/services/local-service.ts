/** @format */

import * as vscode from "vscode";
import { Prompt } from "../models/prompt";
import { Category } from "../models/category";
import { VscodeStorageService } from "./vscode-storage-service";
import { isDuplicatePrompt, filterOutDuplicates } from "../utils";

/**
 * Service for managing local prompts and categories.
 */
export class LocalService {
  private static LOCAL_PROMPTS_KEY = "cursor-local-prompts";
  private static LOCAL_CATEGORIES_KEY = "cursor-local-categories";
  private static DEFAULT_CATEGORY = "General";

  private prompts: Prompt[] = [];
  private categories: Category[] = [];
  private initialized: boolean = false;

  private _onDidPromptssChange = new vscode.EventEmitter<void>();
  readonly onDidPromptsChange: vscode.Event<void> =
    this._onDidPromptssChange.event;

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
   * Loads local prompts and categories from global state
   * Ensures all prompts have a category field and the default category exists
   * Cleans up corrupted category data and remaps affected prompts.
   * @returns Promise that resolves when initialization is complete
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 1. Load prompts and fix missing categoryId
    const storedPrompts = this.storageService.getValue<Prompt[]>(
      LocalService.LOCAL_PROMPTS_KEY,
      []
    );
    let promptsInitiallyModified = false;
    this.prompts = storedPrompts.map((prompt) => {
      if (!prompt.categoryId?.trim()) {
        // Check for null, undefined, or empty categoryId
        promptsInitiallyModified = true;
        return { ...prompt, categoryId: LocalService.DEFAULT_CATEGORY };
      }
      return prompt;
    });

    if (promptsInitiallyModified) {
      await this.savePrompts();
    }

    // 2. Load categories
    const storedCategories = this.storageService.getValue<Category[]>(
      LocalService.LOCAL_CATEGORIES_KEY,
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
          // If it's a corrupted non-Default category with a somewhat valid original ID, record it for prompt migration.
          corruptedCategorySourceIds.add(category.id.trim());
        }
        // Corrupted categories (including a corrupted Default) are not added to pristineCategories at this stage.
        // Default category will be handled specifically later.
      } else {
        pristineCategories.push(category);
      }
    }
    this.categories = pristineCategories; // Start with a list of non-corrupted categories

    // 4. Migrate prompts from corrupted categories
    let promptsRemappedDuringCleanup = false;
    if (corruptedCategorySourceIds.size > 0) {
      const remappedPrompts = this.prompts.map((prompt) => {
        if (
          prompt.categoryId &&
          corruptedCategorySourceIds.has(prompt.categoryId)
        ) {
          promptsRemappedDuringCleanup = true;
          return { ...prompt, categoryId: LocalService.DEFAULT_CATEGORY };
        }
        return prompt;
      });
      if (promptsRemappedDuringCleanup) {
        this.prompts = remappedPrompts;
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

    if (promptsRemappedDuringCleanup) {
      // Only save if remapped during this cleanup phase
      await this.savePrompts();
    }

    // 7. Fire events if data changed, so UI can update
    if (finalCategoriesChanged) {
      this._onDidCategoriesChange.fire();
    }
    // Fire if prompts were modified either initially or during the cleanup
    if (promptsInitiallyModified || promptsRemappedDuringCleanup) {
      this._onDidPromptssChange.fire();
    }

    // 8. Mark initialization complete
    this.initialized = true;
  }

  /**
   * Get all local prompts
   * Returns a copy of the prompts array
   * @returns Array of all local prompts
   */
  public getPrompts(): Prompt[] {
    return [...this.prompts];
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
   * Add a new local prompt
   * @param promptContent The prompt content
   * @param categoryId The ID of the category the prompt belongs to, defaults to the default category ID
   * @returns Promise containing the newly added prompt item or an error object
   */
  public async addPrompt(
    promptContent: string,
    categoryId: string = this.getDefaultCategoryId()
  ): Promise<Prompt | { error: string }> {
    if (!this.categories.some((cat) => cat.id === categoryId)) {
      categoryId = this.getDefaultCategoryId();
    }

    const newItem: Prompt = {
      id: Date.now().toString(),
      label:
        promptContent.length > 30
          ? `${promptContent.slice(0, 30)}...`
          : promptContent,
      content: promptContent,
      timestamp: Date.now(),
      categoryId: categoryId,
      isCloud: false,
    };

    // 检查是否存在重复
    if (isDuplicatePrompt(newItem, this.prompts)) {
      return {
        error:
          "A prompt with the same category, name and content already exists.",
      };
    }

    this.prompts = [...this.prompts, newItem];
    await this.savePrompts();
    this._onDidPromptssChange.fire();
    return newItem;
  }

  /**
   * Add multiple local prompts
   * @param newPrompts Array of prompt items to add
   * @returns Promise that resolves when prompts are added, with the count of added prompts and filtered duplicates
   */
  public async addPrompts(newPrompts: Prompt[]): Promise<{
    added: number;
    duplicates: number;
  }> {
    // 准备要添加的提示，设置正确的分类和isCloud标志
    const preparedPrompts = newPrompts.map((prompt) => ({
      ...prompt,
      categoryId: this.categories.some((cat) => cat.id === prompt.categoryId)
        ? prompt.categoryId
        : this.getDefaultCategoryId(),
      isCloud: false,
    }));

    // 过滤掉已经存在的重复提示
    const uniqueNewPrompts = filterOutDuplicates(preparedPrompts, this.prompts);
    const duplicatesCount = preparedPrompts.length - uniqueNewPrompts.length;

    if (uniqueNewPrompts.length > 0) {
      this.prompts = [...this.prompts, ...uniqueNewPrompts];
      await this.savePrompts();
      this._onDidPromptssChange.fire();
    }

    return {
      added: uniqueNewPrompts.length,
      duplicates: duplicatesCount,
    };
  }

  /**
   * Remove a local prompt
   * @param id The ID of the prompt to remove
   * @returns Promise<boolean> Whether the operation was successful
   */
  public async removePrompt(id: string): Promise<boolean> {
    const originalLength = this.prompts.length;
    this.prompts = this.prompts.filter((prompt) => prompt.id !== id);

    if (this.prompts.length !== originalLength) {
      await this.savePrompts();
      this._onDidPromptssChange.fire();
      return true;
    }
    return false;
  }

  /**
   * Rename a local prompt (set alias)
   * @param id The ID of the prompt to rename
   * @param alias The new alias
   * @returns Promise containing the operation result and any error message
   */
  public async renamePrompt(
    id: string,
    alias: string
  ): Promise<{ success: boolean; error?: string }> {
    const promptToUpdate = this.prompts.find((prompt) => prompt.id === id);
    if (!promptToUpdate) {
      return { success: false, error: "Prompt not found." };
    }

    // 创建重命名后的提示对象进行检查
    const updatedPrompt: Prompt = { ...promptToUpdate, alias };

    // 检查除了自身外是否存在重复
    const otherPrompts = this.prompts.filter((prompt) => prompt.id !== id);
    if (isDuplicatePrompt(updatedPrompt, otherPrompts)) {
      return {
        success: false,
        error:
          "Renaming would create a duplicate prompt (same category, name and content).",
      };
    }

    let updated = false;
    this.prompts = this.prompts.map((prompt) => {
      if (prompt.id === id) {
        updated = true;
        return { ...prompt, alias };
      }
      return prompt;
    });

    if (updated) {
      await this.savePrompts();
      this._onDidPromptssChange.fire();
      return { success: true };
    }
    return { success: false, error: "Renaming operation failed." };
  }

  /**
   * Edit local prompt content
   * @param id The ID of the prompt to edit
   * @param newPrompt The new prompt content
   * @returns Promise containing the operation result and any error message
   */
  public async editPrompt(
    id: string,
    newPrompt: string
  ): Promise<{ success: boolean; error?: string }> {
    const promptToUpdate = this.prompts.find((prompt) => prompt.id === id);
    if (!promptToUpdate) {
      return { success: false, error: "Prompt not found." };
    }

    const newLabel =
      newPrompt.length > 30 ? `${newPrompt.slice(0, 30)}...` : newPrompt;

    // 创建编辑后的提示对象进行检查
    const updatedPrompt: Prompt = {
      ...promptToUpdate,
      content: newPrompt,
      label: promptToUpdate.alias ? promptToUpdate.label : newLabel,
    };

    // 检查除了自身外是否存在重复
    const otherPrompts = this.prompts.filter((prompt) => prompt.id !== id);
    if (isDuplicatePrompt(updatedPrompt, otherPrompts)) {
      return {
        success: false,
        error:
          "Editing would create a duplicate prompt (same category, name and content).",
      };
    }

    let updated = false;
    this.prompts = this.prompts.map((prompt) => {
      if (prompt.id === id) {
        updated = true;
        return {
          ...prompt,
          content: newPrompt,
          label: prompt.alias ? prompt.label : newLabel,
        };
      }
      return prompt;
    });

    if (updated) {
      await this.savePrompts();
      this._onDidPromptssChange.fire();
      return { success: true };
    }
    return { success: false, error: "Editing operation failed." };
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
   * Moves all prompts in this category to the default category
   * @param categoryId The ID of the category to delete
   * @returns Promise containing the operation result and number of moved prompts
   */
  public async deleteCategory(
    categoryId: string
  ): Promise<{ success: boolean; promptsMoved: number }> {
    if (
      !categoryId ||
      categoryId === this.getDefaultCategoryId() ||
      !this.categories.some((cat) => cat.id === categoryId)
    ) {
      return { success: false, promptsMoved: 0 };
    }

    let promptsMoved = 0;
    const defaultCategoryId = this.getDefaultCategoryId();

    this.prompts = this.prompts.map((prompt) => {
      if (prompt.categoryId === categoryId) {
        promptsMoved++;
        return { ...prompt, categoryId: defaultCategoryId };
      }
      return prompt;
    });

    this.categories = this.categories.filter((cat) => cat.id !== categoryId);

    const savePromises: Promise<void>[] = [];
    if (promptsMoved > 0) {
      savePromises.push(this.savePrompts());
    }
    savePromises.push(this.saveCategories());

    await Promise.all(savePromises);

    if (promptsMoved > 0) {
      this._onDidPromptssChange.fire();
    }
    this._onDidCategoriesChange.fire();

    return { success: true, promptsMoved };
  }

  /**
   * Rename a local category
   * Also updates the category of all prompts in the category
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

    let promptsUpdated = false;
    this.prompts = this.prompts.map((prompt) => {
      if (prompt.categoryId === categoryId) {
        promptsUpdated = true;
        return { ...prompt, categoryId: trimmedNewName };
      }
      return prompt;
    });

    const promises = [];
    const needsPromptSave = promptsUpdated;
    const needsCategorySave = categoryUpdated;

    if (needsPromptSave) promises.push(this.savePrompts());
    if (needsCategorySave) promises.push(this.saveCategories());

    if (promises.length > 0) {
      await Promise.all(promises);
      if (needsPromptSave) this._onDidPromptssChange.fire();
      if (needsCategorySave) this._onDidCategoriesChange.fire();
      return true;
    }

    return false;
  }

  /**
   * Move a local prompt to a different local category
   * @param promptId The ID of the prompt to move
   * @param targetCategoryId The ID of the category to move the prompt to
   * @returns Promise containing the operation result and any error message
   */
  public async movePromptToCategory(
    promptId: string,
    targetCategoryId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.categories.some((cat) => cat.id === targetCategoryId)) {
      return { success: false, error: "Target category does not exist." };
    }

    const promptToMove = this.prompts.find((prompt) => prompt.id === promptId);
    if (!promptToMove) {
      return { success: false, error: "Prompt not found." };
    }

    // 如果提示已经在目标分类中，不需要移动
    if (promptToMove.categoryId === targetCategoryId) {
      return { success: true };
    }

    // 创建移动后的提示对象进行检查
    const movedPrompt: Prompt = {
      ...promptToMove,
      categoryId: targetCategoryId,
    };

    // 检查除了自身外是否存在重复
    const otherPrompts = this.prompts.filter(
      (prompt) => prompt.id !== promptId
    );
    if (isDuplicatePrompt(movedPrompt, otherPrompts)) {
      return {
        success: false,
        error:
          "Moving would create a duplicate prompt in the target category (same category, name and content).",
      };
    }

    let updated = false;
    this.prompts = this.prompts.map((prompt) => {
      if (prompt.id === promptId) {
        updated = true;
        return { ...prompt, categoryId: targetCategoryId };
      }
      return prompt;
    });

    if (updated) {
      await this.savePrompts();
      this._onDidPromptssChange.fire();
      return { success: true };
    }
    return { success: false, error: "Moving operation failed." };
  }

  /**
   * Save local prompts to global state
   * @returns Promise that resolves when prompts have been saved
   */
  private async savePrompts(): Promise<void> {
    await this.storageService.setValue(
      LocalService.LOCAL_PROMPTS_KEY,
      this.prompts
    );
  }

  /**
   * Save local categories to global state
   * @returns Promise that resolves when categories have been saved
   */
  private async saveCategories(): Promise<void> {
    await this.storageService.setValue<Category[]>(
      LocalService.LOCAL_CATEGORIES_KEY,
      this.categories
    );
  }

  /**
   * Clears all local memos and categories, then re-initializes the default category.
   * @returns Promise that resolves when all data is cleared and default category is saved.
   */
  public async clearAllLocalData(): Promise<void> {
    this.prompts = [];
    this.categories = [
      {
        id: LocalService.DEFAULT_CATEGORY,
        name: LocalService.DEFAULT_CATEGORY,
      },
    ];

    await this.savePrompts();
    await this.saveCategories();

    this._onDidPromptssChange.fire();
    this._onDidCategoriesChange.fire();
  }
}
