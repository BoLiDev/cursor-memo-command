/** @format */

import * as vscode from "vscode";

// Import services
import { LocalMemoService } from "./services/local-data-service";
import { GitlabApiService } from "./services/gitlab-api-service"; // Import new API service
import { CloudStoreService } from "./services/cloud-store-service"; // Import new cloud state service
import { StorageService } from "./services/storage-service";
import { ConfigurationService } from "./services/configuration-service";

// Import view provider and required types
import {
  MemoTreeDataProvider,
  CategoryGroupTreeItem,
  CategoryTreeItem,
} from "./view/tree-provider";
import { MemoItem } from "./models/memo-item";

import {
  createRemoveCloudCategoryHandler,
  createSyncFromGitLabHandler,
  createManageGitLabTokenHandler,
} from "./commands/cloud-commands";
import {
  createSaveCommandHandler,
  createRemoveCommandHandler,
  createRenameCommandHandler,
  createPasteToEditorHandler,
  createEditCommandHandler,
} from "./commands/local-commands";
import {
  createAddCategoryHandler,
  createRenameCategoryHandler,
  createDeleteCategoryHandler,
  createMoveToCategoryHandler,
  createAddCommandToCategoryHandler,
} from "./commands/category-commands";
import {
  createExportCommandsHandler,
  createImportCommandsHandler,
} from "./commands/data-transfer-commands";
import { createPushToGitLabHandler } from "./commands/gitlab-push-command";

// Tree Data Provider instance
let memoTreeProvider: MemoTreeDataProvider;
// Use the more specific type provided by the TreeDataProvider
let memoTreeView: vscode.TreeView<
  CategoryGroupTreeItem | CategoryTreeItem | MemoItem
>;

/**
 * Activate the extension
 * @param context Extension context
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('"cursor-memo" is now active!');

  // --- Initialization ---
  // Instantiate core services first
  const storageService = new StorageService(context);
  const configService = new ConfigurationService(context);

  // Instantiate dependent services, injecting dependencies
  const localMemoService = new LocalMemoService(storageService);

  // Instantiate new GitLab services
  const gitlabApiService = new GitlabApiService(storageService, configService);
  const cloudStoreService = new CloudStoreService(
    storageService,
    configService,
    gitlabApiService
  );

  // Initialize both services (they load their respective data)
  await localMemoService.initialize();
  await cloudStoreService.initialize(); // Initialize new CloudStoreService

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

  // --- Register Commands ---
  // Pass only the necessary service instances to command handlers
  const commands: { [key: string]: (...args: any[]) => Promise<void> } = {
    // Local Commands (use localMemoService)
    "cursor-memo.saveCommand": createSaveCommandHandler(localMemoService),
    "cursor-memo.removeCommand": createRemoveCommandHandler(localMemoService),
    "cursor-memo.renameCommand": createRenameCommandHandler(localMemoService),
    "cursor-memo.pasteToEditor": createPasteToEditorHandler(), // No service needed
    "cursor-memo.editCommand": createEditCommandHandler(localMemoService),

    // Category Commands (use localMemoService for local categories)
    "cursor-memo.addCategory": createAddCategoryHandler(localMemoService),
    "cursor-memo.renameCategory": createRenameCategoryHandler(localMemoService),
    "cursor-memo.deleteCategory": createDeleteCategoryHandler(localMemoService),
    "cursor-memo.moveToCategory": createMoveToCategoryHandler(localMemoService),
    "cursor-memo.addCommandToCategory":
      createAddCommandToCategoryHandler(localMemoService),

    // Cloud/GitLab Commands (use cloudStoreService)
    "cursor-memo.removeCloudCategory":
      createRemoveCloudCategoryHandler(cloudStoreService),
    "cursor-memo.syncFromGitLab":
      createSyncFromGitLabHandler(cloudStoreService),
    "cursor-memo.manageGitLabToken":
      createManageGitLabTokenHandler(cloudStoreService),
    "cursor-memo.pushToGitLab": createPushToGitLabHandler(
      cloudStoreService,
      localMemoService
    ),

    // Data Transfer Commands (use localMemoService for local data export/import)
    "cursor-memo.exportCommands": createExportCommandsHandler(localMemoService),
    "cursor-memo.importCommands": createImportCommandsHandler(localMemoService),

    // Refresh command - now likely obsolete or could trigger service reloads
    "cursor-memo.refresh": async () => {
      // View updates automatically via events. Manual refresh logic might be needed
      // if there are cases where events might not cover everything (e.g., config change affecting view)
      console.log(
        "Refresh triggered. View should update automatically via events."
      );
      // Optionally, force service re-initialization or data fetching:
      // await localMemoService.initialize(); // Example: Force reload local data
      // await cloudStoreService.initialize(); // Example: Force reload cloud data
    },
  };

  // Register all commands
  for (const commandId in commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, commands[commandId])
    );
  }

  // Initial view is populated automatically by the provider's constructor listening to view model events.
  // The explicit refresh call here is no longer needed.
  // memoTreeProvider.updateView(); // REMOVED
}

/**
 * Deactivate the extension
 */
export function deactivate() {
  console.log('"cursor-memo" is now deactivated!');
  // Note: TreeDataProvider and ViewModel disposals should be handled by VS Code
  // when the extension context subscriptions are disposed, including the memoTreeProvider pushed earlier.
}
