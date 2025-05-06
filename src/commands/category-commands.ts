/** @format */

import * as vscode from "vscode";
import { LocalMemoService } from "../services/local-data-service";
import { MemoTreeDataProvider } from "../view/tree-provider";
import { CategoryTreeItem } from "../view/tree-items";
import { MemoItem } from "../models/memo-item";
import { createMultilineInputBox } from "../utils";
import { Category } from "../models/category";

/**
 * Creates the add category command handler
 * @param dataService The local memo data service
 * @returns The add category command handler function
 */
export function createAddCategoryHandler(
  dataService: LocalMemoService
): (...args: any[]) => Promise<void> {
  return async () => {
    const categoryName = await vscode.window.showInputBox({
      placeHolder: "Enter new category name",
      prompt: "Please enter the name for the new category",
    });

    if (categoryName && categoryName.trim()) {
      const success = await dataService.addCategory(categoryName.trim());

      if (success) {
        vscode.window.showInformationMessage(
          `Category "${categoryName}" created`
        );
      } else {
        vscode.window.showInformationMessage(
          `Category "${categoryName}" already exists`
        );
      }
    }
  };
}

/**
 * Creates the rename category command handler
 * @param dataService The local memo data service
 * @returns The rename category command handler function
 */
export function createRenameCategoryHandler(
  dataService: LocalMemoService
): (...args: any[]) => Promise<void> {
  return async (categoryTreeItem: CategoryTreeItem) => {
    if (!categoryTreeItem) return;

    const categoryToRename = categoryTreeItem.category;
    const defaultCategoryId = dataService.getDefaultCategoryId();

    if (categoryToRename.id === defaultCategoryId) {
      vscode.window.showInformationMessage(
        `Cannot rename the default category`
      );
      return;
    }

    const newCategoryName = await vscode.window.showInputBox({
      placeHolder: "Enter new category name",
      prompt: "Please enter the new name for the category",
      value: categoryToRename.name,
    });

    if (
      newCategoryName &&
      newCategoryName.trim() &&
      newCategoryName !== categoryToRename.name
    ) {
      const success = await dataService.renameCategory(
        categoryToRename.id,
        newCategoryName.trim()
      );

      if (success) {
        vscode.window.showInformationMessage(
          `Category renamed to "${newCategoryName}"`
        );
      } else {
        vscode.window.showInformationMessage(
          `A category named "${newCategoryName}" already exists`
        );
      }
    }
  };
}

/**
 * Creates the delete category command handler
 * @param dataService The local memo data service
 * @returns The delete category command handler function
 */
export function createDeleteCategoryHandler(
  dataService: LocalMemoService
): (...args: any[]) => Promise<void> {
  return async (categoryItem: CategoryTreeItem) => {
    if (!categoryItem) return;

    const categoryName = categoryItem.label;
    const defaultCategory = dataService.getDefaultCategory();

    if (categoryName === defaultCategory) {
      vscode.window.showInformationMessage(
        `Cannot delete the default category`
      );
      return;
    }

    const result = await dataService.deleteCategory(categoryItem.category.id);

    if (result.success) {
      vscode.window.showInformationMessage(
        `Category deleted. ${result.commandsMoved} command(s) moved to the default category.`
      );
    }
  };
}

/**
 * Creates the move to category command handler
 * @param dataService The local memo data service
 * @returns The move to category command handler function
 */
export function createMoveToCategoryHandler(
  dataService: LocalMemoService
): (...args: any[]) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    const allCategories = dataService.getCategories();
    const currentCategoryId = item.categoryId;

    const availableCategories = allCategories.filter(
      (cat) => cat.id !== currentCategoryId
    );

    if (availableCategories.length === 0) {
      vscode.window.showInformationMessage(
        "No other categories available to move to"
      );
      return;
    }

    const selectedCategoryItem = await vscode.window.showQuickPick<
      vscode.QuickPickItem & { category: Category }
    >(
      availableCategories.map((cat) => ({
        label: cat.name,
        description:
          cat.id === dataService.getDefaultCategoryId() ? "(Default)" : "",
        category: cat,
      })),
      {
        placeHolder: "Select a category to move this command to",
      }
    );

    if (selectedCategoryItem) {
      const success = await dataService.moveCommandToCategory(
        item.id,
        selectedCategoryItem.category.id
      );

      if (success) {
        vscode.window.showInformationMessage(
          `Command moved to "${selectedCategoryItem.category.name}"`
        );
      }
    }
  };
}

/**
 * Creates the add command to category handler
 * @param dataService The local memo data service
 * @returns The add command to category handler function
 */
export function createAddCommandToCategoryHandler(
  dataService: LocalMemoService
): (...args: any[]) => Promise<void> {
  return async (categoryItem: CategoryTreeItem) => {
    if (!categoryItem) return;

    const categoryName = categoryItem.label;

    let clipboardText = "";
    try {
      clipboardText = await vscode.env.clipboard.readText();
    } catch (error) {
      // Ignore clipboard errors
    }

    const commandText = await createMultilineInputBox(
      `Add Command to "${categoryName}"`,
      "Enter or paste the command content",
      clipboardText
    );

    if (commandText) {
      await dataService.addCommand(commandText, categoryItem.category.id);
      vscode.window.showInformationMessage(
        `Command added to "${categoryName}"`
      );
    }
  };
}
