/** @format */

import * as vscode from "vscode";

// Import services
import { LocalMemoService } from "./services/local-data-service";
import { GitlabClient } from "./services/gitlab-service"; // Renamed to GitlabClient, handles cloud

// Import view provider and required types
import {
  MemoTreeDataProvider,
  CategoryGroupTreeItem,
  CategoryTreeItem,
} from "./view/tree-provider";
import { MemoItem } from "./models/memo-item";

// Import all command handlers from the commands index
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
  createRemoveCloudCategoryHandler,
} from "./commands";

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
  // Instantiate both services
  const localMemoService = new LocalMemoService(context);
  const gitlabService = new GitlabClient(context);

  // Initialize both services (they load their respective data)
  await localMemoService.initialize();
  await gitlabService.initialize(); // GitlabClient now needs initialization

  // Instantiate TreeDataProvider with both services
  memoTreeProvider = new MemoTreeDataProvider(localMemoService, gitlabService);

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

    // Cloud/GitLab Commands (use gitlabService)
    "cursor-memo.removeCloudCategory": createRemoveCloudCategoryHandler(
      gitlabService, // Pass gitlabService now
      memoTreeProvider
    ),
    "cursor-memo.syncFromGitLab": createSyncFromGitLabHandler(
      gitlabService, // Pass gitlabService now
      memoTreeProvider
    ),
    "cursor-memo.manageGitLabToken":
      createManageGitLabTokenHandler(gitlabService), // Pass gitlabService now

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

  // --- Watch for configuration changes (e.g., GitLab settings) ---
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("cursorMemo.gitlab")) {
        // Optionally trigger a refresh or notify user if GitLab config changes
        vscode.window.showInformationMessage(
          "GitLab configuration changed. You may need to sync again."
        );
        // Trigger refresh to potentially update GitLabClient state if needed by TreeView
        memoTreeProvider.updateView();
      }
    })
  );

  // Initial refresh to load data into the view
  memoTreeProvider.updateView();
}

/**
 * Deactivate the extension
 */
export function deactivate() {
  console.log('"cursor-memo" is now deactivated!');
}
