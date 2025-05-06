/** @format */

import { Prompt } from "../models/prompt";
import { LocalService } from "./local-service";
import { PromptsStructureSchema, parsePrompts, serializePrompts } from "../zod";
import { z } from "zod";
import { Category } from "../models/category";
import { filterOutDuplicates } from "../utils";

/**
 * Service for handling data import and export operations for LOCAL data.
 */
export class LocalTransferService {
  constructor(private localService: LocalService) {}

  /**
   * Export all data as JSON string using the human-friendly format
   * @returns JSON string of all prompts organized by category and alias
   */
  public exportData(): string {
    const prompts = this.localService.getPrompts();
    const categories = this.localService.getCategories();
    const promptsData = this._transformMemoItemsToExportStructure(
      prompts,
      categories
    );
    return serializePrompts(promptsData);
  }

  /**
   * Export selected categories as JSON string using the human-friendly format
   * @param selectedCategories Array of category names to export
   * @returns JSON string of selected categories and their prompts
   */
  public exportSelectedCategories(selectedCategories: string[]): string {
    const filteredPrompts = this.localService
      .getPrompts()
      .filter((prompt) => selectedCategories.includes(prompt.categoryId));

    const categories = this.localService.getCategories();
    const promptsData = this._transformMemoItemsToExportStructure(
      filteredPrompts,
      categories
    );
    return serializePrompts(promptsData);
  }

  /**
   * Export selected prompts as JSON string using the human-friendly format
   * @param selectedPrompts Array of prompt items to export
   * @returns JSON string of selected prompts organized by category and alias
   */
  public exportSelectedPrompts(selectedPrompts: Prompt[]): string {
    const categories = this.localService.getCategories();
    const promptsData = this._transformMemoItemsToExportStructure(
      selectedPrompts,
      categories
    );
    return serializePrompts(promptsData);
  }

  /**
   * Import data from JSON string
   * @param jsonData JSON string of prompts data in the new format
   * @returns Promise with result of import operation
   */
  public async importData(jsonData: string): Promise<{
    success: boolean;
    importedPrompts: number;
    duplicatePrompts: number;
    importedCategories: number;
  }> {
    try {
      const { prompts, categoryNames } =
        this._parseAndTransformImportData(jsonData);

      // Handle categories
      const currentCategories = this.localService.getCategories();
      const currentCategoryIds = new Set(currentCategories.map((c) => c.id));
      const newCategoryNames = categoryNames.filter(
        (catName) => catName.trim() !== "" && !currentCategoryIds.has(catName)
      );

      if (newCategoryNames.length > 0) {
        await this.localService.addCategories(newCategoryNames);
      }

      // Get current prompts for deduplication
      const currentPrompts = this.localService.getPrompts();

      // Filter out duplicate prompts
      const uniquePrompts = filterOutDuplicates(prompts, currentPrompts);
      const duplicateCount = prompts.length - uniquePrompts.length;

      // Handle prompts
      let addedCount = 0;
      if (uniquePrompts.length > 0) {
        const result = await this.localService.addPrompts(uniquePrompts);
        addedCount = result.added;
      }

      return {
        success: true,
        importedPrompts: addedCount,
        duplicatePrompts: duplicateCount,
        importedCategories: newCategoryNames.length,
      };
    } catch {
      return {
        success: false,
        importedPrompts: 0,
        duplicatePrompts: 0,
        importedCategories: 0,
      };
    }
  }

  /**
   * Import selected categories from JSON string
   * @param jsonData JSON string of prompts data in the new format
   * @param selectedCategories Array of category names to import
   * @returns Promise with result of import operation
   */
  public async importSelectedData(
    jsonData: string,
    selectedCategories: string[]
  ): Promise<{
    success: boolean;
    importedPrompts: number;
    duplicatePrompts: number;
    importedCategories: number;
  }> {
    try {
      const { promptsData } = this._parseAndTransformImportData(jsonData);

      // Filter out selected categories
      const filteredData: z.infer<typeof PromptsStructureSchema> = {};
      Object.keys(promptsData)
        .filter((categoryName) => selectedCategories.includes(categoryName))
        .forEach((categoryName) => {
          filteredData[categoryName] = promptsData[categoryName];
        });

      // Get category names
      const categoryNamesFiltered = Object.keys(filteredData);

      // Convert to internal format
      const promptsFiltered =
        this._transformParsedDataToMemoItems(filteredData);

      // Handle categories
      const currentCategories = this.localService.getCategories();
      const currentCategoryIds = new Set(currentCategories.map((c) => c.id));
      const newCategoryNames = categoryNamesFiltered.filter(
        (catName) => catName.trim() !== "" && !currentCategoryIds.has(catName)
      );

      if (newCategoryNames.length > 0) {
        await this.localService.addCategories(newCategoryNames);
      }

      // Get current prompts for deduplication
      const currentPrompts = this.localService.getPrompts();

      // Filter out duplicate prompts
      const uniquePrompts = filterOutDuplicates(
        promptsFiltered,
        currentPrompts
      );
      const duplicateCount = promptsFiltered.length - uniquePrompts.length;

      // Handle prompts
      let addedCount = 0;
      if (uniquePrompts.length > 0) {
        const result = await this.localService.addPrompts(uniquePrompts);
        addedCount = result.added;
      }

      return {
        success: true,
        importedPrompts: addedCount,
        duplicatePrompts: duplicateCount,
        importedCategories: newCategoryNames.length,
      };
    } catch {
      return {
        success: false,
        importedPrompts: 0,
        duplicatePrompts: 0,
        importedCategories: 0,
      };
    }
  }

  /**
   * Parses the prompt data string and transforms it into MemoItems and category names.
   * @param jsonData The raw JSON string from the import file.
   * @returns An object containing the parsed prompts structure, the transformed MemoItems array, and category names.
   * @throws If parsing or validation fails.
   */
  private _parseAndTransformImportData(jsonData: string): {
    promptsData: z.infer<typeof PromptsStructureSchema>;
    prompts: Omit<Prompt, "isCloud">[];
    categoryNames: string[];
  } {
    const promptsData = parsePrompts(jsonData);
    const prompts = this._transformParsedDataToMemoItems(promptsData);
    const categoryNames = Object.keys(promptsData);
    return { promptsData, prompts, categoryNames };
  }

  /**
   * Helper to transform parsed prompt data structure into MemoItems.
   * @param promptsData Parsed prompt data.
   * @returns Array of MemoItems (without isCloud property).
   */
  private _transformParsedDataToMemoItems(
    promptsData: z.infer<typeof PromptsStructureSchema>
  ): Omit<Prompt, "isCloud">[] {
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
    return items;
  }

  /**
   * Transforms an array of MemoItems into the nested structure for export.
   * Uses the provided categories to map category IDs to names.
   * @param items The MemoItem array.
   * @param categories The Category array for ID-to-name mapping.
   * @returns The nested prompt structure.
   */
  private _transformMemoItemsToExportStructure(
    items: Prompt[],
    categories: Category[]
  ): z.infer<typeof PromptsStructureSchema> {
    const result: z.infer<typeof PromptsStructureSchema> = {};
    const categoryMap = new Map(categories.map((cat) => [cat.id, cat.name]));

    items.forEach((item) => {
      const categoryName = categoryMap.get(item.categoryId) ?? item.categoryId; // Use map, fallback to ID
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
