/** @format */

import * as vscode from "vscode";
import { CloudService } from "../services/cloud-service";
import { CategoryTreeItem } from "../view/tree-items";
import { VSCodeUserInteractionService } from "../services/vscode-user-interaction-service";

/**
 * Creates the remove cloud category handler.
 * Allows removing a cloud category locally without affecting remote data.
 * @param cloudStoreService The service managing cloud prompt state
 * @param uiService The user interaction service
 * @returns The remove cloud category handler function
 */
export function createRemoveCloudCategoryHandler(
  cloudStoreService: CloudService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async (categoryItem: CategoryTreeItem) => {
    if (!categoryItem) return;

    const categoryId = categoryItem.category.id;

    const confirmationItem = await uiService.showWarningMessage(
      `Remove the cloud category "${categoryItem.category.name}" from local view? This won't delete it from GitLab.`,
      { modal: true },
      { title: "Remove Locally" }
    );

    if (confirmationItem?.title !== "Remove Locally") {
      return;
    }

    const result = await cloudStoreService.removeCloudCategory(categoryId);

    if (result.success) {
      await uiService.showInformationMessage(
        `Removed cloud category "${categoryItem.category.name}" from local storage. ${result.removedPrompts} prompt(s) removed.`
      );
    } else {
      await uiService.showErrorMessage(
        `Failed to remove cloud category "${categoryItem.category.name}"`
      );
    }
  };
}

/**
 * Creates the sync from GitLab prompt handler
 * @param cloudStoreService The service managing cloud prompt state
 * @param uiService The user interaction service
 * @returns The sync from GitLab prompt handler function
 */
export function createSyncFromGitLabHandler(
  cloudStoreService: CloudService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async () => {
    try {
      // Step 1: Fetch all available categories (without progress bar)
      const categoriesResult =
        await cloudStoreService.fetchAvailableCategories();

      if (!categoriesResult.success) {
        if (categoriesResult.needsAuth) {
          await uiService.showWarningMessage(
            "GitLab token is missing or invalid."
          );
          await uiService.executeCommand("cursor-memo.manageGitLabToken");
        } else {
          await uiService.showErrorMessage(
            `Failed to fetch categories: ${categoriesResult.error}`
          );
        }
        return;
      }

      const cloudCategories = categoriesResult.data;
      if (!cloudCategories || cloudCategories.length === 0) {
        await uiService.showInformationMessage(
          "No categories found on GitLab to sync."
        );
        return;
      }

      // Step 2: Let user select categories
      const selectedOption = await uiService.showQuickPick(
        cloudCategories.map((cat) => ({ label: cat })),
        {
          placeHolder: "Select categories to sync from cloud",
          canPickMany: true,
        }
      );

      if (!selectedOption || selectedOption.length === 0) {
        return;
      }

      const selectedCategoryLabels = selectedOption.map((item) => item.label);

      // Step 3: Use progress bar to execute sync operation, but don't show notification
      let syncResult = await uiService.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Syncing from GitLab",
          cancellable: false,
        },
        async (progress) => {
          progress.report({
            message: `Syncing ${selectedCategoryLabels.length} selected categories...`,
          });

          // Execute sync operation and return result, so progress bar closes after operation
          return await cloudStoreService.syncSelectedFromGitLab(
            selectedCategoryLabels
          );
        }
      );

      // Show result message outside progress bar, so it doesn't block progress bar closing
      if (syncResult.success) {
        // Use void operator to ensure message doesn't block function execution
        void uiService.showInformationMessage(
          `Synced ${syncResult.data.syncedPrompts} prompt(s) from selected GitLab categories.`
        );
      } else {
        if (syncResult.needsAuth) {
          // Token related operation needs to be completed
          await uiService.showWarningMessage(
            "GitLab token became invalid during sync."
          );
          await uiService.executeCommand("cursor-memo.manageGitLabToken");
        } else {
          // Error message doesn't need to block
          void uiService.showErrorMessage(
            `Error syncing from GitLab: ${syncResult.error}`
          );
        }
      }
    } catch (error) {
      // Error message doesn't need to block
      void uiService.showErrorMessage(
        `Error during GitLab sync: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  };
}

/**
 * Creates the manage GitLab token prompt handler
 * @param cloudStoreService The service managing cloud prompt state (and token storage)
 * @param uiService The user interaction service
 * @returns The manage GitLab token prompt handler function
 */
export function createManageGitLabTokenHandler(
  cloudStoreService: CloudService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async () => {
    const token = await uiService.showInputBox({
      password: true,
      placeHolder: "Enter new GitLab Personal Access Token (PAT)",
      prompt:
        "Token needed for GitLab sync. Leave blank to clear existing token.",
      ignoreFocusOut: true,
      title: "Manage GitLab Token",
    });

    if (token === "") {
      await cloudStoreService.clearToken();
      await uiService.showInformationMessage("GitLab token cleared");
    } else if (token !== undefined) {
      await cloudStoreService.setToken(token);
      await uiService.showInformationMessage("GitLab token saved");
    }
  };
}
