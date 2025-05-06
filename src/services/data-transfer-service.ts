/** @format */

import { MemoItem } from "../models/memo-item";
import { LocalMemoService } from "./local-data-service";
import {
  CommandsStructureSchema,
  parseCommands,
  serializeCommands,
} from "../zod";
import { z } from "zod";
import { Category } from "../models/category";

/**
 * Service for handling data import and export operations for LOCAL data.
 */
export class DataTransferService {
  constructor(private dataService: LocalMemoService) {}

  /**
   * Export all data as JSON string using the human-friendly format
   * @returns JSON string of all commands organized by category and alias
   */
  public exportData(): string {
    const commands = this.dataService.getCommands();
    const categories = this.dataService.getCategories();
    const commandsData = this._transformMemoItemsToExportStructure(
      commands,
      categories
    );
    return serializeCommands(commandsData);
  }

  /**
   * Export selected categories as JSON string using the human-friendly format
   * @param selectedCategories Array of category names to export
   * @returns JSON string of selected categories and their commands
   */
  public exportSelectedCategories(selectedCategories: string[]): string {
    const filteredCommands = this.dataService
      .getCommands()
      .filter((cmd) => selectedCategories.includes(cmd.categoryId));

    const categories = this.dataService.getCategories();
    const commandsData = this._transformMemoItemsToExportStructure(
      filteredCommands,
      categories
    );
    return serializeCommands(commandsData);
  }

  /**
   * Import data from JSON string
   * @param jsonData JSON string of commands data in the new format
   * @returns Promise with result of import operation
   */
  public async importData(jsonData: string): Promise<{
    success: boolean;
    importedCommands: number;
    importedCategories: number;
  }> {
    try {
      const { commandsData, commands, categoryNames } =
        this._parseAndTransformImportData(jsonData);

      // 处理分类
      const currentCategories = this.dataService.getCategories();
      const currentCategoryIds = new Set(currentCategories.map((c) => c.id));
      const newCategoryNames = categoryNames.filter(
        (catName) => catName.trim() !== "" && !currentCategoryIds.has(catName)
      );

      if (newCategoryNames.length > 0) {
        await this.dataService.addCategories(newCategoryNames);
      }

      // 处理命令
      if (commands.length > 0) {
        await this.dataService.addCommands(commands);
      }

      return {
        success: true,
        importedCommands: commands.length,
        importedCategories: newCategoryNames.length,
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
   * @param jsonData JSON string of commands data in the new format
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
      const { commandsData, commands, categoryNames } =
        this._parseAndTransformImportData(jsonData);

      // 过滤出选中的分类
      const filteredData: z.infer<typeof CommandsStructureSchema> = {};
      Object.keys(commandsData)
        .filter((categoryName) => selectedCategories.includes(categoryName))
        .forEach((categoryName) => {
          filteredData[categoryName] = commandsData[categoryName];
        });

      // 获取分类
      const categoryNamesFiltered = Object.keys(filteredData);

      // 转换为内部格式
      const commandsFiltered =
        this._transformParsedDataToMemoItems(filteredData);

      // 处理分类
      const currentCategories = this.dataService.getCategories();
      const currentCategoryIds = new Set(currentCategories.map((c) => c.id));
      const newCategoryNames = categoryNamesFiltered.filter(
        (catName) => catName.trim() !== "" && !currentCategoryIds.has(catName)
      );

      if (newCategoryNames.length > 0) {
        await this.dataService.addCategories(newCategoryNames);
      }

      // 处理命令
      if (commandsFiltered.length > 0) {
        await this.dataService.addCommands(commandsFiltered);
      }

      return {
        success: true,
        importedCommands: commandsFiltered.length,
        importedCategories: newCategoryNames.length,
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
   * Parses the command data string and transforms it into MemoItems and category names.
   * @param jsonData The raw JSON string from the import file.
   * @returns An object containing the parsed commands structure, the transformed MemoItems array, and category names.
   * @throws If parsing or validation fails.
   */
  private _parseAndTransformImportData(jsonData: string): {
    commandsData: z.infer<typeof CommandsStructureSchema>;
    commands: Omit<MemoItem, "isCloud">[];
    categoryNames: string[];
  } {
    const commandsData = parseCommands(jsonData);
    const commands = this._transformParsedDataToMemoItems(commandsData);
    const categoryNames = Object.keys(commandsData);
    return { commandsData, commands, categoryNames };
  }

  /**
   * Helper to transform parsed command data structure into MemoItems.
   * @param commandsData Parsed command data.
   * @returns Array of MemoItems (without isCloud property).
   */
  private _transformParsedDataToMemoItems(
    commandsData: z.infer<typeof CommandsStructureSchema>
  ): Omit<MemoItem, "isCloud">[] {
    const now = Date.now();
    const items: Omit<MemoItem, "isCloud">[] = [];

    Object.entries(commandsData).forEach(([categoryName, commands]) => {
      Object.entries(commands).forEach(([alias, commandObj]) => {
        const command = commandObj.content;
        const label =
          command.length > 30 ? `${command.slice(0, 30)}...` : command;
        const categoryId = categoryName; // Assume name is ID for import

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
    return items;
  }

  /**
   * Transforms an array of MemoItems into the nested structure for export.
   * Uses the provided categories to map category IDs to names.
   * @param items The MemoItem array.
   * @param categories The Category array for ID-to-name mapping.
   * @returns The nested command structure.
   */
  private _transformMemoItemsToExportStructure(
    items: MemoItem[],
    categories: Category[]
  ): z.infer<typeof CommandsStructureSchema> {
    const result: z.infer<typeof CommandsStructureSchema> = {};
    const categoryMap = new Map(categories.map((cat) => [cat.id, cat.name]));

    items.forEach((item) => {
      const categoryName = categoryMap.get(item.categoryId) ?? item.categoryId; // Use map, fallback to ID
      const alias = item.alias || item.label || "Unnamed Command";

      if (!result[categoryName]) {
        result[categoryName] = {};
      }

      if (!result[categoryName][alias]) {
        result[categoryName][alias] = {
          content: item.command,
        };
      } else {
        console.warn(
          `Export collision in category '${categoryName}' for alias '${alias}'. Keeping first encountered.`
        );
      }
    });

    return result;
  }
}
