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

  // Register Tree View
  memoTreeView = vscode.window.createTreeView("cursorMemoPanel", {
    treeDataProvider: memoTreeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(memoTreeView);

  // Set the command to be executed when a memo item is clicked (no change needed)
  memoTreeProvider.setCommandCallback("cursor-memo.pasteToEditor");

  // --- Register Commands ---
  // Pass the correct service instances to command handlers
  const commands: { [key: string]: (...args: any[]) => Promise<void> } = {
    // Local Commands (use localMemoService)
    "cursor-memo.saveCommand": createSaveCommandHandler(
      localMemoService,
      memoTreeProvider
    ),
    "cursor-memo.removeCommand": createRemoveCommandHandler(
      localMemoService,
      memoTreeProvider
    ),
    "cursor-memo.renameCommand": createRenameCommandHandler(
      localMemoService,
      memoTreeProvider
    ),
    "cursor-memo.pasteToEditor": createPasteToEditorHandler(), // No service needed
    "cursor-memo.editCommand": createEditCommandHandler(
      localMemoService,
      memoTreeProvider
    ),

    // Category Commands (use localMemoService for local categories)
    "cursor-memo.addCategory": createAddCategoryHandler(
      localMemoService,
      memoTreeProvider
    ),
    "cursor-memo.renameCategory": createRenameCategoryHandler(
      localMemoService,
      memoTreeProvider
    ),
    "cursor-memo.deleteCategory": createDeleteCategoryHandler(
      localMemoService,
      memoTreeProvider
    ),
    "cursor-memo.moveToCategory": createMoveToCategoryHandler(
      localMemoService,
      memoTreeProvider
    ),
    "cursor-memo.addCommandToCategory": createAddCommandToCategoryHandler(
      localMemoService,
      memoTreeProvider
    ),

    // Cloud/GitLab Commands (use cloudStoreService)
    "cursor-memo.removeCloudCategory": createRemoveCloudCategoryHandler(
      cloudStoreService,
      memoTreeProvider
    ),
    "cursor-memo.syncFromGitLab": createSyncFromGitLabHandler(
      cloudStoreService,
      memoTreeProvider
    ),
    "cursor-memo.manageGitLabToken":
      createManageGitLabTokenHandler(cloudStoreService),
    "cursor-memo.pushToGitLab": createPushToGitLabHandler(
      cloudStoreService,
      localMemoService
    ),

    // Data Transfer Commands (use localMemoService for local data export/import)
    "cursor-memo.exportCommands": createExportCommandsHandler(localMemoService),
    "cursor-memo.importCommands": createImportCommandsHandler(
      localMemoService,
      memoTreeProvider
    ),

    // Refresh command
    "cursor-memo.refresh": async () => {
      // ViewModel update now handles both local and cloud refresh
      memoTreeProvider.updateView();
    },
  };

  // Register all commands
  for (const commandId in commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, commands[commandId])
    );
  }

  // Initial refresh to load data into the view
  memoTreeProvider.updateView();
}

/**
 * Deactivate the extension
 */
export function deactivate() {
  console.log('"cursor-memo" is now deactivated!');
}
