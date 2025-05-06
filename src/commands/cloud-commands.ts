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
    // First fetch all available categories from GitLab
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Fetching categories from GitLab",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Retrieving available categories..." });

        try {
          // Get available categories from GitLab
          const cloudCategories =
            await gitlabService.fetchAvailableCategories();

          if (!cloudCategories || cloudCategories.length === 0) {
            vscode.window.showInformationMessage(
              "No categories available on GitLab"
            );
            return;
          }

          // Let user select categories to sync
          const selectedOption = await vscode.window.showQuickPick(
            cloudCategories,
            {
              placeHolder: "Select categories to sync from cloud",
              canPickMany: true,
            }
          );

          if (!selectedOption || selectedOption.length === 0) {
            return;
          }

          // Perform sync based on user selection
          progress.report({
            message: `Syncing ${selectedOption.length} selected categories...`,
          });

          const result =
            await gitlabService.syncSelectedFromGitLab(selectedOption);

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
        } catch (error) {
          vscode.window.showErrorMessage(
            `Error connecting to GitLab: ${error instanceof Error ? error.message : "Unknown error"}`
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
