/** @format */

import * as vscode from "vscode";

import { LocalService } from "./services/local-service";
import { GitlabApiService } from "./services/cloud-api-service";
import { CloudService } from "./services/cloud-service";
import { VscodeStorageService } from "./services/vscode-storage-service";
import { ConfigurationService } from "./services/configuration-service";
import { VSCodeUserInteractionService } from "./services/vscode-user-interaction-service"; // Use class

import {
  MemoTreeDataProvider,
  CategoryGroupTreeItem,
  CategoryTreeItem,
} from "./view/tree-provider";
import { Prompt } from "./models/prompt";

import {
  createRemoveCloudCategoryHandler,
  createSyncFromGitLabHandler,
  createManageGitLabTokenHandler,
} from "./commands/cloud-commands";
import {
  createSavePromptHandler,
  createRemovePromptHandler,
  createRenamePromptHandler,
  createPasteToEditorHandler,
  createEditPromptHandler,
} from "./commands/local-commands";
import {
  createAddCategoryHandler,
  createRenameCategoryHandler,
  createDeleteCategoryHandler,
  createMoveToCategoryHandler,
  createAddPromptToCategoryHandler,
} from "./commands/category-commands";
import {
  createExportPromptsHandler,
  createImportPromptsHandler,
} from "./commands/local-transfer-commands";
import { createPushToGitLabHandler } from "./commands/cloud-push-command";

let memoTreeProvider: MemoTreeDataProvider;
let memoTreeView: vscode.TreeView<
  CategoryGroupTreeItem | CategoryTreeItem | Prompt
>;

/**
 * Activate the extension
 * @param context Extension context
 */
export async function activate(context: vscode.ExtensionContext) {
  // Instantiate core services first
  const storageService = new VscodeStorageService(context);
  const configService = new ConfigurationService(context);
  const uiService = new VSCodeUserInteractionService(); // Use class directly

  // Instantiate dependent services, injecting dependencies
  const localMemoService = new LocalService(storageService);

  // Instantiate new GitLab services
  const gitlabApiService = new GitlabApiService(storageService, configService);
  const cloudStoreService = new CloudService(
    storageService,
    configService,
    gitlabApiService
  );

  // Initialize both services (they load their respective data)
  await localMemoService.initialize();
  await cloudStoreService.initialize();

  // Instantiate TreeDataProvider with both services
  memoTreeProvider = new MemoTreeDataProvider(
    localMemoService,
    cloudStoreService
  );
  // Register Tree View and push TreeDataProvider to subscriptions for disposal
  memoTreeView = vscode.window.createTreeView("cursorMemoPanel", {
    treeDataProvider: memoTreeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(memoTreeView);
  context.subscriptions.push(memoTreeProvider); // Ensure provider is disposed

  // Set the command to be executed when a memo item is clicked (no change needed)
  memoTreeProvider.setCommandCallback("cursor-memo.pasteToEditor");

  // Register Commands
  const commands: { [key: string]: (...args: any[]) => Promise<void> } = {
    // Local Commands
    "cursor-memo.savePrompt": createSavePromptHandler(
      localMemoService,
      uiService
    ),
    "cursor-memo.removePrompt": createRemovePromptHandler(
      localMemoService,
      uiService
    ),
    "cursor-memo.renamePrompt": createRenamePromptHandler(
      localMemoService,
      uiService
    ),
    "cursor-memo.pasteToEditor": createPasteToEditorHandler(uiService),
    "cursor-memo.editPrompt": createEditPromptHandler(
      localMemoService,
      uiService
    ),

    // Category Commands
    "cursor-memo.addCategory": createAddCategoryHandler(
      localMemoService,
      uiService
    ),
    "cursor-memo.renameCategory": createRenameCategoryHandler(
      localMemoService,
      uiService
    ),
    "cursor-memo.deleteCategory": createDeleteCategoryHandler(
      localMemoService,
      uiService
    ),
    "cursor-memo.moveToCategory": createMoveToCategoryHandler(
      localMemoService,
      uiService
    ),
    "cursor-memo.addPromptToCategory": createAddPromptToCategoryHandler(
      localMemoService,
      uiService
    ),

    // Cloud/GitLab Commands
    "cursor-memo.removeCloudCategory": createRemoveCloudCategoryHandler(
      cloudStoreService,
      uiService
    ),
    "cursor-memo.syncFromGitLab": createSyncFromGitLabHandler(
      cloudStoreService,
      uiService
    ),
    "cursor-memo.manageGitLabToken": createManageGitLabTokenHandler(
      cloudStoreService,
      uiService
    ),
    "cursor-memo.pushToGitLab": createPushToGitLabHandler(
      cloudStoreService,
      localMemoService,
      uiService
    ),

    // Data Transfer Commands
    "cursor-memo.exportPrompts": createExportPromptsHandler(
      localMemoService,
      uiService
    ),
    "cursor-memo.importPrompts": createImportPromptsHandler(
      localMemoService,
      uiService
    ),

    // New command to clear local storage
    "cursor-memo.clearLocalStorage": async () => {
      const confirmSelection =
        await uiService.showQuickPick<vscode.QuickPickItem>(
          [{ label: "Yes" }, { label: "No" }],
          {
            placeHolder:
              "Are you sure you want to clear all local memo data? This cannot be undone.",
          }
        );

      if (confirmSelection && confirmSelection.label === "Yes") {
        try {
          await localMemoService.clearAllLocalData();
          vscode.window.showInformationMessage(
            "Local memo storage has been cleared."
          );
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Error clearing local storage: ${error.message || error}`
          );
        }
      }
    },

    // Refresh command
    "cursor-memo.refresh": async () => {
      // console.log(
      //   "Refresh triggered. View should update automatically via events."
      // );
    },
  };

  // Register all commands
  for (const commandId in commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, commands[commandId])
    );
  }
}

/**
 * Deactivate the extension
 */
export function deactivate() {
  // console.log('"cursor-memo" is now deactivated!');
  // Note: TreeDataProvider and ViewModel disposals should be handled by VS Code
  // when the extension context subscriptions are disposed, including the memoTreeProvider pushed earlier.
}
