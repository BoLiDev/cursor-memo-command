/** @format */

import * as vscode from "vscode";
import {
  CloudStoreService,
  CloudOperationResult,
} from "../services/cloud-store-service";
import { MemoTreeDataProvider } from "../view/tree-provider";
import { CategoryTreeItem } from "../view/tree-items";

/**
 * Creates the remove cloud category handler.
 * Allows removing a cloud category locally without affecting remote data.
 * @param cloudStoreService The service managing cloud command state
 * @returns The remove cloud category handler function
 */
export function createRemoveCloudCategoryHandler(
  cloudStoreService: CloudStoreService
): (...args: any[]) => Promise<void> {
  return async (categoryItem: CategoryTreeItem) => {
    if (!categoryItem) return;

    const categoryId = categoryItem.category.id;

    const result = await cloudStoreService.removeCloudCategory(categoryId);

    if (result.success) {
      vscode.window.showInformationMessage(
        `Removed cloud category "${categoryItem.category.name}" from local storage. ${result.removedCommands} command(s) removed.`
      );
    } else {
      vscode.window.showErrorMessage(
        `Failed to remove cloud category "${categoryItem.category.name}"`
      );
    }
  };
}

/**
 * Creates the sync from GitLab command handler
 * @param cloudStoreService The service managing cloud command state
 * @returns The sync from GitLab command handler function
 */
export function createSyncFromGitLabHandler(
  cloudStoreService: CloudStoreService
): (...args: any[]) => Promise<void> {
  return async () => {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Syncing from GitLab",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Fetching categories..." });

        const categoriesResult =
          await cloudStoreService.fetchAvailableCategories();

        if (!categoriesResult.success) {
          if (categoriesResult.needsAuth) {
            vscode.window.showWarningMessage(
              "GitLab token is missing or invalid."
            );
            vscode.commands.executeCommand("cursor-memo.manageGitLabToken");
          } else {
            vscode.window.showErrorMessage(
              `Failed to fetch categories: ${categoriesResult.error}`
            );
          }
          return;
        }

        const cloudCategories = categoriesResult.data;
        if (!cloudCategories || cloudCategories.length === 0) {
          vscode.window.showInformationMessage(
            "No categories found on GitLab to sync."
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

        const syncResult =
          await cloudStoreService.syncSelectedFromGitLab(selectedOption);

        if (syncResult.success) {
          vscode.window.showInformationMessage(
            `Synced ${syncResult.data.syncedCommands} command(s) from selected GitLab categories.`
          );
        } else {
          if (syncResult.needsAuth) {
            vscode.window.showWarningMessage(
              "GitLab token became invalid during sync."
            );
            vscode.commands.executeCommand("cursor-memo.manageGitLabToken");
          } else {
            vscode.window.showErrorMessage(
              `Error syncing from GitLab: ${syncResult.error}`
            );
          }
        }
      }
    );
  };
}

/**
 * Creates the manage GitLab token command handler
 * @param cloudStoreService The service managing cloud command state (and token storage)
 * @returns The manage GitLab token command handler function
 */
export function createManageGitLabTokenHandler(
  cloudStoreService: CloudStoreService
): (...args: any[]) => Promise<void> {
  return async () => {
    const currentTokenAction = "View Current Token (Not Recommended)";
    const token = await vscode.window.showInputBox({
      password: true,
      placeHolder: "Enter new GitLab Personal Access Token (PAT)",
      prompt:
        "Token needed for GitLab sync. Leave blank to clear existing token.",
      ignoreFocusOut: true,
      title: "Manage GitLab Token",
    });

    if (token === "") {
      await cloudStoreService.clearToken();
      vscode.window.showInformationMessage("GitLab token cleared");
    } else if (token) {
      await cloudStoreService.setToken(token);
      vscode.window.showInformationMessage("GitLab token saved");
    }
  };
}
