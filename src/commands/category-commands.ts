/** @format */

import * as vscode from "vscode";
import { LocalMemoService } from "../services/local-data-service";
import { MemoTreeDataProvider } from "../view/tree-provider";
import { CategoryTreeItem } from "../view/tree-items";
import { MemoItem } from "../models/memo-item";

/**
 * Creates the add category command handler
 * @param dataService The local memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The add category command handler function
 */
export function createAddCategoryHandler(
  dataService: LocalMemoService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async () => {
    const categoryName = await vscode.window.showInputBox({
      placeHolder: "Enter new category name",
      prompt: "Please enter the name for the new category",
    });

    if (categoryName && categoryName.trim()) {
      const success = await dataService.addCategory(categoryName.trim());

      if (success) {
        memoTreeProvider.updateView();
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
 * @param memoTreeProvider The memo tree data provider
 * @returns The rename category command handler function
 */
export function createRenameCategoryHandler(
  dataService: LocalMemoService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async (categoryItem: CategoryTreeItem) => {
    if (!categoryItem) return;

    const oldCategoryName = categoryItem.label;
    const defaultCategory = dataService.getDefaultCategory();

    if (oldCategoryName === defaultCategory) {
      vscode.window.showInformationMessage(
        `Cannot rename the default category`
      );
      return;
    }

    const newCategoryName = await vscode.window.showInputBox({
      placeHolder: "Enter new category name",
      prompt: "Please enter the new name for the category",
      value: oldCategoryName,
    });

    if (
      newCategoryName &&
      newCategoryName.trim() &&
      newCategoryName !== oldCategoryName
    ) {
      const success = await dataService.renameCategory(
        oldCategoryName,
        newCategoryName.trim()
      );

      if (success) {
        memoTreeProvider.updateView();
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
 * @param memoTreeProvider The memo tree data provider
 * @returns The delete category command handler function
 */
export function createDeleteCategoryHandler(
  dataService: LocalMemoService,
  memoTreeProvider: MemoTreeDataProvider
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

    const confirmation = await vscode.window.showWarningMessage(
      `Are you sure you want to delete the category "${categoryName}"? All commands in this category will be moved to the default category.`,
      { modal: true },
      "Yes"
    );

    if (confirmation === "Yes") {
      const result = await dataService.deleteCategory(categoryName);

      if (result.success) {
        memoTreeProvider.updateView();
        vscode.window.showInformationMessage(
          `Category deleted. ${result.commandsMoved} command(s) moved to the default category.`
        );
      }
    }
  };
}

/**
 * Creates the move to category command handler
 * @param dataService The local memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The move to category command handler function
 */
export function createMoveToCategoryHandler(
  dataService: LocalMemoService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    const categories = dataService.getCategories();
    const currentCategory = item.category;

    // Filter out the current category from options
    const categoriesWithoutCurrent = categories.filter(
      (cat) => cat !== currentCategory
    );

    if (categoriesWithoutCurrent.length === 0) {
      vscode.window.showInformationMessage(
        "No other categories available to move to"
      );
      return;
    }

    const selectedCategory = await vscode.window.showQuickPick(
      categoriesWithoutCurrent,
      {
        placeHolder: "Select a category to move this command to",
      }
    );

    if (selectedCategory) {
      const success = await dataService.moveCommandToCategory(
        item.id,
        selectedCategory
      );

      if (success) {
        memoTreeProvider.updateView();
        vscode.window.showInformationMessage(
          `Command moved to "${selectedCategory}"`
        );
      }
    }
  };
}

/**
 * Creates the add command to category handler
 * @param dataService The local memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The add command to category handler function
 */
export function createAddCommandToCategoryHandler(
  dataService: LocalMemoService,
  memoTreeProvider: MemoTreeDataProvider
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

    const commandText = await vscode.window.showInputBox({
      placeHolder: "Enter command",
      prompt: `Add a command to category "${categoryName}"`,
      value: clipboardText,
    });

    if (commandText) {
      await dataService.addCommand(commandText, categoryName);
      memoTreeProvider.updateView();
      vscode.window.showInformationMessage(
        `Command added to "${categoryName}"`
      );
    }
  };
}
