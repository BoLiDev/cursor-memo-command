/** @format */

import { MemoItem } from "../models/memo-item";
import { LocalMemoService } from "./local-data-service";
import {
  CommandsStructureSchema,
  fromMemoItems,
  parseCommands,
  serializeCommands,
  toMemoItems,
} from "../zod/command-schema";
import { z } from "zod";

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
    const commandsData = fromMemoItems(commands);
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
      .filter((cmd) => selectedCategories.includes(cmd.category));

    const commandsData = fromMemoItems(filteredCommands);
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
      // 解析数据
      const commandsData = parseCommands(jsonData);

      // 获取分类
      const categories = Object.keys(commandsData);

      // 转换为内部格式
      const commands = toMemoItems(commandsData);

      // 处理分类
      const currentCategories = this.dataService.getCategories();
      const newCategories = categories.filter(
        (cat) => cat.trim() !== "" && !currentCategories.includes(cat)
      );

      if (newCategories.length > 0) {
        await this.dataService.addCategories(newCategories);
      }

      // 处理命令
      if (commands.length > 0) {
        await this.dataService.addCommands(commands);
      }

      return {
        success: true,
        importedCommands: commands.length,
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
      // 解析数据
      const allCommandsData = parseCommands(jsonData);

      // 过滤出选中的分类
      const filteredData: z.infer<typeof CommandsStructureSchema> = {};
      Object.keys(allCommandsData)
        .filter((category) => selectedCategories.includes(category))
        .forEach((category) => {
          filteredData[category] = allCommandsData[category];
        });

      // 获取分类
      const categories = Object.keys(filteredData);

      // 转换为内部格式
      const commands = toMemoItems(filteredData);

      // 处理分类
      const currentCategories = this.dataService.getCategories();
      const newCategories = categories.filter(
        (cat) => cat.trim() !== "" && !currentCategories.includes(cat)
      );

      if (newCategories.length > 0) {
        await this.dataService.addCategories(newCategories);
      }

      // 处理命令
      if (commands.length > 0) {
        await this.dataService.addCommands(commands);
      }

      return {
        success: true,
        importedCommands: commands.length,
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
}
