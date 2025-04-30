/** @format */

import * as vscode from "vscode";
import { MemoDataService, MemoItem } from "./memoDataService";
import { MemoTreeDataProvider, CategoryTreeItem } from "./memoTreeDataProvider";
import { createMultilineInputBox, directPaste } from "./utils";

/**
 * Creates the save command handler
 * @param dataService The memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The save command handler function
 */
export function createSaveCommandHandler(
  dataService: MemoDataService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async () => {
    let clipboardText = "";
    try {
      clipboardText = await vscode.env.clipboard.readText();
    } catch (error) {
      // Ignore clipboard errors
    }

    const commandText = await createMultilineInputBox(
      "Save Command",
      "Enter or paste the command content",
      clipboardText
    );

    if (commandText) {
      await dataService.addCommand(commandText);
      memoTreeProvider.updateView();
      vscode.window.showInformationMessage("Command saved");
    }
  };
}

/**
 * Creates the remove command handler
 * @param dataService The memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The remove command handler function
 */
export function createRemoveCommandHandler(
  dataService: MemoDataService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    const success = await dataService.removeCommand(item.id);

    if (success) {
      memoTreeProvider.updateView();
      vscode.window.showInformationMessage("Command deleted");
    }
  };
}

/**
 * Creates the rename command handler
 * @param dataService The memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The rename command handler function
 */
export function createRenameCommandHandler(
  dataService: MemoDataService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    const alias = await vscode.window.showInputBox({
      placeHolder: "Enter new alias for the command",
      prompt: "This will change how the command appears in the list",
      value: item.alias || item.label,
    });

    if (alias !== undefined) {
      const success = await dataService.renameCommand(item.id, alias);

      if (success) {
        memoTreeProvider.updateView();
        vscode.window.showInformationMessage("Command renamed");
      }
    }
  };
}

/**
 * Creates the paste to editor command handler
 * @returns The paste to editor command handler function
 */
export function createPasteToEditorHandler(): (
  ...args: any[]
) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    await vscode.env.clipboard.writeText(item.command);
    await directPaste();
  };
}

/**
 * Creates the edit command handler
 * @param dataService The memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The edit command handler function
 */
export function createEditCommandHandler(
  dataService: MemoDataService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    const editedCommand = await createMultilineInputBox(
      "Edit Command Content",
      "Modify command content",
      item.command
    );

    if (editedCommand !== undefined && editedCommand !== item.command) {
      const success = await dataService.editCommand(item.id, editedCommand);

      if (success) {
        memoTreeProvider.updateView();
        vscode.window.showInformationMessage("Command updated");
      }
    }
  };
}

/**
 * Creates the add category command handler
 * @param dataService The memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The add category command handler function
 */
export function createAddCategoryHandler(
  dataService: MemoDataService,
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
 * @param dataService The memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The rename category command handler function
 */
export function createRenameCategoryHandler(
  dataService: MemoDataService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async (categoryItem) => {
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
          `Category "${newCategoryName}" already exists or operation failed`
        );
      }
    }
  };
}

/**
 * Creates the delete category command handler
 * @param dataService The memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The delete category command handler function
 */
export function createDeleteCategoryHandler(
  dataService: MemoDataService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async (categoryItem) => {
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
      `Are you sure you want to delete category "${categoryName}"? Commands in this category will be moved to the default category.`,
      { modal: true },
      "Delete"
    );

    if (confirmation !== "Delete") {
      return;
    }

    const result = await dataService.deleteCategory(categoryName);

    if (result.success) {
      memoTreeProvider.updateView();

      if (result.commandsMoved > 0) {
        vscode.window.showInformationMessage(
          `Category "${categoryName}" deleted, ${result.commandsMoved} commands moved to the default category`
        );
      } else {
        vscode.window.showInformationMessage(
          `Category "${categoryName}" deleted`
        );
      }
    }
  };
}

/**
 * Creates the move to category command handler
 * @param dataService The memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The move to category command handler function
 */
export function createMoveToCategoryHandler(
  dataService: MemoDataService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    const allCategories = dataService.getCategories();

    const categoryOptions = allCategories.filter(
      (cat) => cat !== item.category
    );

    if (categoryOptions.length === 0) {
      const result = await vscode.window.showInformationMessage(
        "No target categories available. Create a new category?",
        "Create"
      );

      if (result === "Create") {
        vscode.commands.executeCommand("cursor-memo.addCategory");
      }

      return;
    }

    const targetCategory = await vscode.window.showQuickPick(categoryOptions, {
      placeHolder: "Select target category",
    });

    if (targetCategory) {
      const success = await dataService.moveCommandToCategory(
        item.id,
        targetCategory
      );

      if (success) {
        memoTreeProvider.updateView();
        vscode.window.showInformationMessage(
          `Command moved to "${targetCategory}"`
        );
      }
    }
  };
}

/**
 * Creates the add command to category handler
 * @param dataService The memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The add command to category handler function
 */
export function createAddCommandToCategoryHandler(
  dataService: MemoDataService,
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

    const commandText = await createMultilineInputBox(
      `Add Command to ${categoryName}`,
      "Enter the command content",
      clipboardText
    );

    if (commandText) {
      await dataService.addCommand(commandText, categoryName);
      memoTreeProvider.updateView();
      vscode.window.showInformationMessage(`Command added to ${categoryName}`);
    }
  };
}

/**
 * Creates the export commands handler
 * @param dataService The memo data service
 * @returns The export commands handler function
 */
export function createExportCommandsHandler(
  dataService: MemoDataService
): (...args: any[]) => Promise<void> {
  return async () => {
    const allCategories = dataService.getCategories();

    // 提供给用户选择要导出的分类
    const selectedCategories = await vscode.window.showQuickPick(
      [...allCategories.map((category) => ({ label: category }))],
      {
        canPickMany: true,
        placeHolder: "Select categories to export (空选表示导出所有分类)",
        title: "Export Commands",
      }
    );

    if (selectedCategories === undefined) {
      return; // 用户取消了选择
    }

    // 获取导出数据
    let exportData: string;
    if (selectedCategories.length === 0) {
      // 未选择任何分类时导出全部
      exportData = dataService.exportData();
    } else {
      const categoriesToExport = selectedCategories.map((item) => item.label);
      exportData = dataService.exportSelectedCategories(categoriesToExport);
    }

    // 提供保存文件对话框让用户直接选择保存位置和文件名
    const defaultFileName = `cursor-memo-commands-${new Date().toISOString().slice(0, 10)}.json`;
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultFileName),
      filters: {
        JSON: ["json"],
      },
      title: "Export Commands",
      saveLabel: "Export",
    });

    if (uri) {
      try {
        // 将数据写入到用户选择的文件
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(exportData, "utf-8")
        );
        vscode.window.showInformationMessage(
          `Commands successfully exported to ${uri.fsPath}`
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to export commands: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  };
}

/**
 * Creates the import commands handler
 * @param dataService The memo data service
 * @param memoTreeProvider The memo tree data provider
 * @returns The import commands handler function
 */
export function createImportCommandsHandler(
  dataService: MemoDataService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async () => {
    // 提供文件选择对话框让用户直接选择文件
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        JSON: ["json"],
      },
      title: "Import Commands",
    });

    if (!uris || uris.length === 0) {
      return;
    }

    try {
      // 读取用户选择的文件内容
      const fileData = await vscode.workspace.fs.readFile(uris[0]);
      const jsonData = Buffer.from(fileData).toString("utf-8");

      const result = await dataService.importData(jsonData);

      if (result.success) {
        memoTreeProvider.updateView();
        vscode.window.showInformationMessage(
          `Successfully imported ${result.importedCommands} commands and ${result.importedCategories} categories.`
        );
      } else {
        vscode.window.showErrorMessage(
          "Failed to import data. Please ensure the JSON file is in the correct format."
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to import commands: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
}
