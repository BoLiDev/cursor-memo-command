/** @format */

import * as vscode from "vscode";

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
}

/**
 * Data service for memo items
 */
export class MemoDataService {
  private static STORAGE_KEY = "cursor-memo-commands";
  private static CATEGORIES_KEY = "cursor-memo-categories";
  private static DEFAULT_CATEGORY = "default";

  private commands: MemoItem[] = [];
  private categories: string[] = [];
  private initialized: boolean = false;

  /**
   * Constructor
   * @param context VSCode extension context for accessing global state storage
   */
  constructor(private context: vscode.ExtensionContext) {}

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

    const index = this.categories.indexOf(oldName);
    if (index === -1) {
      return false;
    }

    this.categories[index] = newName;

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
   * Move a command to a specific category
   * @param commandId The ID of the command to move
   * @param targetCategory The target category
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
   * 导出命令和分类数据为JSON字符串
   * @returns 包含所有命令和分类数据的JSON字符串
   */
  public exportData(): string {
    const exportData = {
      commands: this.commands,
      categories: this.categories,
    };
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 从JSON字符串导入命令和分类数据
   * 处理重复项：分类名称重复时保留原有的，命令重复时（基于内容判断）忽略导入
   * @param jsonData 包含命令和分类数据的JSON字符串
   * @returns 导入操作的结果：成功与否以及导入的命令和分类数量
   */
  public async importData(jsonData: string): Promise<{
    success: boolean;
    importedCommands: number;
    importedCategories: number;
  }> {
    try {
      // 解析JSON数据
      const data = JSON.parse(jsonData);

      if (
        !data.commands ||
        !Array.isArray(data.commands) ||
        !data.categories ||
        !Array.isArray(data.categories)
      ) {
        return { success: false, importedCommands: 0, importedCategories: 0 };
      }

      // 导入分类（去重）
      let importedCategories = 0;
      for (const category of data.categories) {
        if (
          typeof category === "string" &&
          !this.categories.includes(category) &&
          category !== MemoDataService.DEFAULT_CATEGORY
        ) {
          this.categories.push(category);
          importedCategories++;
        }
      }

      // 导入命令（去重 - 基于命令内容判断）
      let importedCommands = 0;
      const existingCommandContents = new Set(
        this.commands.map((cmd) => cmd.command)
      );

      for (const cmd of data.commands) {
        // 验证命令数据结构
        if (!cmd.id || !cmd.command || !cmd.label || !cmd.timestamp) {
          continue;
        }

        // 检查命令内容是否已存在
        if (!existingCommandContents.has(cmd.command)) {
          // 确保分类存在，如果不存在则使用默认分类
          const category =
            cmd.category && this.categories.includes(cmd.category)
              ? cmd.category
              : MemoDataService.DEFAULT_CATEGORY;

          // 创建新的命令ID以避免ID冲突
          const newCmd: MemoItem = {
            id:
              Date.now().toString() + Math.random().toString().substring(2, 8),
            label: cmd.label,
            command: cmd.command,
            timestamp: cmd.timestamp,
            alias: cmd.alias,
            category: category,
          };

          this.commands.push(newCmd);
          existingCommandContents.add(cmd.command);
          importedCommands++;
        }
      }

      // 如果有导入的数据，保存到存储
      if (importedCategories > 0) {
        await this.saveCategories();
      }

      if (importedCommands > 0) {
        await this.saveCommands();
      }

      return {
        success: true,
        importedCommands,
        importedCategories,
      };
    } catch (error) {
      console.error("Import data error:", error);
      return { success: false, importedCommands: 0, importedCategories: 0 };
    }
  }

  /**
   * Save commands to storage
   */
  private async saveCommands(): Promise<void> {
    await this.context.globalState.update(
      MemoDataService.STORAGE_KEY,
      this.commands
    );
  }

  /**
   * Save categories to storage
   */
  private async saveCategories(): Promise<void> {
    await this.context.globalState.update(
      MemoDataService.CATEGORIES_KEY,
      this.categories
    );
  }
}
