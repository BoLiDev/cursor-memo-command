/** @format */

import { MemoItem } from "../models/memo-item";
import { LocalMemoService } from "./local-data-service";

/**
 * Service for handling data import and export operations for LOCAL data.
 */
export class DataTransferService {
  constructor(private dataService: LocalMemoService) {}

  /**
   * Export all data as JSON string
   * @returns JSON string of all commands and categories
   */
  public exportData(): string {
    return JSON.stringify({
      commands: this.dataService.getCommands(),
      categories: this.dataService.getCategories(),
    });
  }

  /**
   * Export selected categories as JSON string
   * @param selectedCategories Array of category names to export
   * @returns JSON string of selected categories and their commands
   */
  public exportSelectedCategories(selectedCategories: string[]): string {
    const filteredCommands = this.dataService
      .getCommands()
      .filter((cmd) => selectedCategories.includes(cmd.category));

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
      const currentCategories = this.dataService.getCategories();
      const newCategories = importedCategories.filter(
        (cat) =>
          typeof cat === "string" &&
          cat.trim() !== "" &&
          !currentCategories.includes(cat)
      );

      if (newCategories.length > 0) {
        await this.dataService.addCategories(newCategories); // Use the bulk method
      }

      // Process commands with proper IDs
      const now = Date.now();
      const processedCommands = validCommands.map((cmd) => {
        const label =
          cmd.label ||
          (cmd.command.length > 30
            ? `${cmd.command.slice(0, 30)}...`
            : cmd.command);
        const category = this.dataService.getCategories().includes(cmd.category)
          ? cmd.category
          : this.dataService.getDefaultCategory();

        return {
          ...cmd,
          id: `${cmd.id}_imported_${now}`,
          label: label,
          timestamp: cmd.timestamp || now,
          category: category,
        };
      });

      if (processedCommands.length > 0) {
        await this.dataService.addCommands(processedCommands); // Use the bulk method
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
        selectedCategories.includes(
          cmd.category || this.dataService.getDefaultCategory()
        )
      );

      // Filter categories to only include selected ones that exist in the import data
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
      const currentCategories = this.dataService.getCategories();
      const newCategories = importedCategories.filter(
        (cat) =>
          typeof cat === "string" &&
          cat.trim() !== "" &&
          !currentCategories.includes(cat)
      );

      if (newCategories.length > 0) {
        await this.dataService.addCategories(newCategories); // Use the bulk method
      }

      // Process commands with proper IDs
      const now = Date.now();
      const processedCommands = validCommands.map((cmd) => {
        const label =
          cmd.label ||
          (cmd.command.length > 30
            ? `${cmd.command.slice(0, 30)}...`
            : cmd.command);
        const category = this.dataService.getCategories().includes(cmd.category)
          ? cmd.category
          : this.dataService.getDefaultCategory();

        return {
          ...cmd,
          id: `${cmd.id}_imported_${now}`,
          label: label,
          timestamp: cmd.timestamp || now,
          category: category,
        };
      });

      if (processedCommands.length > 0) {
        await this.dataService.addCommands(processedCommands); // Use the bulk method
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
}
