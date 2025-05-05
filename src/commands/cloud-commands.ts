/** @format */

import * as vscode from "vscode";
import { GitlabClient } from "../services/gitlab-service";
import { MemoTreeDataProvider } from "../view/tree-provider";
import { CategoryTreeItem } from "../view/tree-items";

/**
 * Creates the remove cloud category handler.
 * Allows removing a cloud category locally without affecting remote data.
 * @param gitlabService The GitLab service client
 * @param memoTreeProvider The memo tree data provider
 * @returns The remove cloud category handler function
 */
export function createRemoveCloudCategoryHandler(
  gitlabService: GitlabClient,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async (categoryItem: CategoryTreeItem) => {
    if (!categoryItem) return;

    const categoryName = categoryItem.label;

    const result = await gitlabService.removeCloudCategory(categoryName);

    if (result.success) {
      memoTreeProvider.updateView();
      vscode.window.showInformationMessage(
        `Removed cloud category "${categoryName}" from local storage. ${result.removedCommands} command(s) removed.`
      );
    } else {
      vscode.window.showErrorMessage(
        `Failed to remove cloud category "${categoryName}"`
      );
    }
  };
}

/**
 * Creates the sync from GitLab command handler
 * @param gitlabService The GitLab service client
 * @param memoTreeProvider The memo tree data provider
 * @returns The sync from GitLab command handler function
 */
export function createSyncFromGitLabHandler(
  gitlabService: GitlabClient,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async () => {
    // Get locally known cloud categories for selection
    const cloudCategories = new Set<string>();
    gitlabService.getCloudCommands().forEach((item) => {
      cloudCategories.add(item.category);
    });
    const availableCloudCategories = Array.from(cloudCategories);

    // If no cloud categories are known locally, perform full sync (likely first time)
    if (availableCloudCategories.length === 0) {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Syncing from GitLab (All)",
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: "Fetching all commands..." });
          const result = await gitlabService.syncFromGitLab();
          if (result.success) {
            memoTreeProvider.updateView();
            vscode.window.showInformationMessage(
              `Synced ${result.syncedCommands} command(s) from GitLab`
            );
          } else {
            vscode.window.showErrorMessage(
              `Error syncing from GitLab: ${result.error || "Unknown error"}`
            );
          }
        }
      );
      return;
    }

    // Provide options to sync selected local categories or all
    const allOption = "Sync All Categories (Overwrite Local)";
    const options = [allOption, ...availableCloudCategories];

    const selectedOption = await vscode.window.showQuickPick(options, {
      placeHolder:
        "Select existing cloud categories to sync, or choose 'Sync All'",
      canPickMany: true,
    });

    if (!selectedOption || selectedOption.length === 0) {
      return;
    }

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Syncing from GitLab",
        cancellable: false,
      },
      async (progress) => {
        let result;
        let categoriesToSync: string[] = [];

        // Check if "all" option was selected
        if (selectedOption.includes(allOption)) {
          progress.report({ message: "Syncing all categories..." });
          result = await gitlabService.syncFromGitLab();
        } else {
          // Sync only selected categories
          categoriesToSync = selectedOption;
          progress.report({
            message: `Syncing ${categoriesToSync.length} selected categories...`,
          });
          result = await gitlabService.syncSelectedFromGitLab(categoriesToSync);
        }

        if (result.success) {
          memoTreeProvider.updateView();
          vscode.window.showInformationMessage(
            `Synced ${result.syncedCommands} command(s) from GitLab`
          );
        } else {
          vscode.window.showErrorMessage(
            `Error syncing from GitLab: ${result.error || "Unknown error"}`
          );
        }
      }
    );
  };
}

/**
 * Creates the manage GitLab token command handler
 * @param gitlabService The GitLab service client
 * @returns The manage GitLab token command handler function
 */
export function createManageGitLabTokenHandler(
  gitlabService: GitlabClient
): (...args: any[]) => Promise<void> {
  return async () => {
    const token = await vscode.window.showInputBox({
      password: true,
      placeHolder: "Enter your GitLab Personal Access Token",
      prompt:
        "Token needed for GitLab sync. Leave blank to clear existing token.",
    });

    if (token === "") {
      await gitlabService.clearToken();
      vscode.window.showInformationMessage("GitLab token cleared");
    } else if (token) {
      await gitlabService.setToken(token);
      vscode.window.showInformationMessage("GitLab token saved");
    }
  };
}
