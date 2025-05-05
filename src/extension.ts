/** @format */

import * as vscode from "vscode";
import { MemoTreeDataProvider } from "./memoTreeDataProvider";
import { MemoDataService } from "./memoDataService";
import { createCommand, showError } from "./utils";
import {
  createSaveCommandHandler,
  createRemoveCommandHandler,
  createRenameCommandHandler,
  createPasteToEditorHandler,
  createEditCommandHandler,
  createAddCategoryHandler,
  createRenameCategoryHandler,
  createDeleteCategoryHandler,
  createMoveToCategoryHandler,
  createAddCommandToCategoryHandler,
  createExportCommandsHandler,
  createImportCommandsHandler,
  createSyncFromGitLabHandler,
  createManageGitLabTokenHandler,
} from "./commands";

/**
 * Extension activation function
 * Called by VSCode when the extension is activated
 * Initializes data service, tree view, and various commands
 * @param context VSCode extension context for registering commands and storing state
 */
export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Cursor Memo");
  outputChannel.appendLine("Cursor Memo Plugin activated");

  const dataService = new MemoDataService(context);
  dataService
    .initialize()
    .then(() => {
      const memoTreeProvider = new MemoTreeDataProvider(dataService);

      const saveCommandDisposable = createCommand(
        "cursor-memo.saveCommand",
        createSaveCommandHandler(dataService, memoTreeProvider),
        "Error saving command"
      );

      const removeCommandDisposable = createCommand(
        "cursor-memo.removeCommand",
        createRemoveCommandHandler(dataService, memoTreeProvider),
        "Error removing command"
      );

      const renameCommandDisposable = createCommand(
        "cursor-memo.renameCommand",
        createRenameCommandHandler(dataService, memoTreeProvider),
        "Error renaming command"
      );

      const pasteToEditorDisposable = createCommand(
        "cursor-memo.pasteToEditor",
        createPasteToEditorHandler(),
        "Error pasting command"
      );

      const editCommandDisposable = createCommand(
        "cursor-memo.editCommand",
        createEditCommandHandler(dataService, memoTreeProvider),
        "Error editing command"
      );

      const addCategoryDisposable = createCommand(
        "cursor-memo.addCategory",
        createAddCategoryHandler(dataService, memoTreeProvider),
        "Error adding category"
      );

      const renameCategoryDisposable = createCommand(
        "cursor-memo.renameCategory",
        createRenameCategoryHandler(dataService, memoTreeProvider),
        "Error renaming category"
      );

      const deleteCategoryDisposable = createCommand(
        "cursor-memo.deleteCategory",
        createDeleteCategoryHandler(dataService, memoTreeProvider),
        "Error deleting category"
      );

      const moveToCategory = createCommand(
        "cursor-memo.moveToCategory",
        createMoveToCategoryHandler(dataService, memoTreeProvider),
        "Error moving command"
      );

      const addCommandToCategory = createCommand(
        "cursor-memo.addCommandToCategory",
        createAddCommandToCategoryHandler(dataService, memoTreeProvider),
        "Error adding command to category"
      );

      const exportCommands = createCommand(
        "cursor-memo.exportCommands",
        createExportCommandsHandler(dataService),
        "Error exporting commands"
      );

      const importCommands = createCommand(
        "cursor-memo.importCommands",
        createImportCommandsHandler(dataService, memoTreeProvider),
        "Error importing commands"
      );

      const syncFromGitLab = createCommand(
        "cursor-memo.syncFromGitLab",
        createSyncFromGitLabHandler(dataService, memoTreeProvider),
        "Error syncing from GitLab"
      );

      const manageGitLabToken = createCommand(
        "cursor-memo.manageGitLabToken",
        createManageGitLabTokenHandler(dataService),
        "Error managing GitLab token"
      );

      memoTreeProvider.setCommandCallback("cursor-memo.pasteToEditor");

      const treeView = vscode.window.createTreeView("cursorMemoPanel", {
        treeDataProvider: memoTreeProvider,
        showCollapseAll: false,
      });

      // Add sync button to view title
      treeView.onDidChangeVisibility((e) => {
        if (e.visible) {
          vscode.commands.executeCommand(
            "setContext",
            "cursor-memo.treeViewVisible",
            true
          );
        } else {
          vscode.commands.executeCommand(
            "setContext",
            "cursor-memo.treeViewVisible",
            false
          );
        }
      });

      context.subscriptions.push(
        saveCommandDisposable,
        removeCommandDisposable,
        renameCommandDisposable,
        pasteToEditorDisposable,
        editCommandDisposable,
        addCategoryDisposable,
        renameCategoryDisposable,
        deleteCategoryDisposable,
        moveToCategory,
        addCommandToCategory,
        exportCommands,
        importCommands,
        syncFromGitLab,
        manageGitLabToken,
        treeView,
        outputChannel
      );

      outputChannel.appendLine("Cursor Memo Plugin fully initialized");
    })
    .catch((error) => {
      showError("Failed to initialize Cursor Memo", error);
    });
}

/**
 * Extension deactivation function
 * Called by VSCode when the extension is deactivated
 * Used to clean up resources and display deactivation message
 */
export function deactivate() {
  vscode.window.showInformationMessage("Cursor Memo Plugin deactivated");
}
