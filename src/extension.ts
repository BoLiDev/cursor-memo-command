/** @format */

import * as vscode from "vscode";

import { LocalMemoService } from "./services/local-data-service";
import { GitlabApiService } from "./services/gitlab-api-service";
import { CloudStoreService } from "./services/cloud-store-service";
import { StorageService } from "./services/storage-service";
import { ConfigurationService } from "./services/configuration-service";
import { VSCodeUserInteractionService } from "./services/vscode-user-interaction-service"; // Use class

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

let memoTreeProvider: MemoTreeDataProvider;
let memoTreeView: vscode.TreeView<
  CategoryGroupTreeItem | CategoryTreeItem | MemoItem
>;

/**
 * Activate the extension
 * @param context Extension context
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('"cursor-memo" is now active!');

  // Instantiate core services first
  const storageService = new StorageService(context);
  const configService = new ConfigurationService(context);
  const uiService = new VSCodeUserInteractionService(); // Use class directly

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
    "cursor-memo.saveCommand": createSaveCommandHandler(
      localMemoService,
      uiService
    ),
    "cursor-memo.removeCommand": createRemoveCommandHandler(localMemoService),
    "cursor-memo.renameCommand": createRenameCommandHandler(
      localMemoService,
      uiService
    ),
    "cursor-memo.pasteToEditor": createPasteToEditorHandler(uiService),
    "cursor-memo.editCommand": createEditCommandHandler(
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
    "cursor-memo.addCommandToCategory": createAddCommandToCategoryHandler(
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
    "cursor-memo.exportCommands": createExportCommandsHandler(
      localMemoService,
      uiService
    ),
    "cursor-memo.importCommands": createImportCommandsHandler(
      localMemoService,
      uiService
    ),

    // Refresh command
    "cursor-memo.refresh": async () => {
      console.log(
        "Refresh triggered. View should update automatically via events."
      );
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
  console.log('"cursor-memo" is now deactivated!');
  // Note: TreeDataProvider and ViewModel disposals should be handled by VS Code
  // when the extension context subscriptions are disposed, including the memoTreeProvider pushed earlier.
}
