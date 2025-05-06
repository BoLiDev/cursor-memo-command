/** @format */

import * as vscode from "vscode";
import { LocalService } from "../services/local-service";
import { CategoryTreeItem } from "../view/tree-items";
import { MemoItem } from "../models/memo-item";
import { Category } from "../models/category";
import { VSCodeUserInteractionService } from "../services/vscode-user-interaction-service";

/**
 * Creates the add category command handler
 * @param dataService The local memo data service
 * @param uiService The user interaction service
 * @returns The add category command handler function
 */
export function createAddCategoryHandler(
  dataService: LocalService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async () => {
    const categoryName = await uiService.showInputBox({
      placeHolder: "Enter new category name",
      prompt: "Please enter the name for the new category",
    });

    if (categoryName && categoryName.trim()) {
      const success = await dataService.addCategory(categoryName.trim());

      if (success) {
        await uiService.showInformationMessage(
          `Category "${categoryName}" created`
        );
      } else {
        await uiService.showInformationMessage(
          `Category "${categoryName}" already exists`
        );
      }
    }
  };
}

/**
 * Creates the rename category command handler
 * @param dataService The local memo data service
 * @param uiService The user interaction service
 * @returns The rename category command handler function
 */
export function createRenameCategoryHandler(
  dataService: LocalService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async (categoryTreeItem: CategoryTreeItem) => {
    if (!categoryTreeItem) return;

    const categoryToRename = categoryTreeItem.category;
    const defaultCategoryId = dataService.getDefaultCategoryId();

    if (categoryToRename.id === defaultCategoryId) {
      await uiService.showInformationMessage(
        `Cannot rename the default category`
      );
      return;
    }

    const newCategoryName = await uiService.showInputBox({
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
        await uiService.showInformationMessage(
          `Category renamed to "${newCategoryName}"`
        );
      } else {
        await uiService.showInformationMessage(
          `A category named "${newCategoryName}" already exists`
        );
      }
    }
  };
}

/**
 * Creates the delete category command handler
 * @param dataService The local memo data service
 * @param uiService The user interaction service
 * @returns The delete category command handler function
 */
export function createDeleteCategoryHandler(
  dataService: LocalService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async (categoryItem: CategoryTreeItem) => {
    if (!categoryItem) return;

    const categoryName = categoryItem.label;
    const defaultCategory = dataService.getDefaultCategory();

    if (categoryName === defaultCategory) {
      await uiService.showInformationMessage(
        `Cannot delete the default category`
      );
      return;
    }

    const confirmationItem = await uiService.showWarningMessage(
      `Are you sure you want to delete the category "${categoryName}"? Commands inside will be moved to Default.`,
      { modal: true },
      { title: "Delete" }
    );

    if (confirmationItem?.title !== "Delete") {
      return;
    }

    const result = await dataService.deleteCategory(categoryItem.category.id);

    if (result.success) {
      await uiService.showInformationMessage(
        `Category deleted. ${result.commandsMoved} command(s) moved to the default category.`
      );
    } else {
      await uiService.showErrorMessage(
        `Failed to delete category "${categoryName}".`
      );
    }
  };
}

/**
 * Creates the move to category command handler
 * @param dataService The local memo data service
 * @param uiService The user interaction service
 * @returns The move to category command handler function
 */
export function createMoveToCategoryHandler(
  dataService: LocalService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    const allCategories = dataService.getCategories();
    const currentCategoryId = item.categoryId;

    const availableCategories = allCategories.filter(
      (cat) => cat.id !== currentCategoryId
    );

    if (availableCategories.length === 0) {
      await uiService.showInformationMessage(
        "No other categories available to move to"
      );
      return;
    }

    type CategoryQuickPickItem = vscode.QuickPickItem & { category: Category };

    const selectedCategoryItem =
      await uiService.showQuickPick<CategoryQuickPickItem>(
        availableCategories.map(
          (cat): CategoryQuickPickItem => ({
            label: cat.name,
            description:
              cat.id === dataService.getDefaultCategoryId() ? "(Default)" : "",
            category: cat,
          })
        ),
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
        await uiService.showInformationMessage(
          `Command moved to "${selectedCategoryItem.category.name}"`
        );
      }
    }
  };
}

/**
 * Creates the add command to category handler
 * @param dataService The local memo data service
 * @param uiService The user interaction service
 * @returns The add command to category handler function
 */
export function createAddCommandToCategoryHandler(
  dataService: LocalService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async (categoryItem: CategoryTreeItem) => {
    if (!categoryItem) return;

    const categoryName = categoryItem.label;

    let clipboardText = "";
    try {
      clipboardText = await uiService.readClipboard();
    } catch {
      uiService.showErrorMessage("Failed to read clipboard");
    }

    const commandText = await uiService.createMultilineInputBox(
      `Add Command to "${categoryName}"`,
      "Enter or paste the command content",
      clipboardText
    );

    if (commandText) {
      await dataService.addCommand(commandText, categoryItem.category.id);
      await uiService.showInformationMessage(
        `Command added to "${categoryName}"`
      );
    }
  };
}
