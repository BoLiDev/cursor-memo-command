/** @format */

import * as vscode from "vscode";
import { GitlabClient } from "../services/gitlab-service";
import { MemoTreeDataProvider } from "../view/tree-provider";
import { CategoryTreeItem } from "../view/tree-items";

/**
 * Creates the remove cloud category handler
 * 允许用户删除本地云端分类的功能（不影响云端数据）
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
    // 获取本地已知的云端分类以供选择
    const cloudCategories = new Set<string>();
    gitlabService.getCloudCommands().forEach((item) => {
      cloudCategories.add(item.category);
    });
    const availableCloudCategories = Array.from(cloudCategories);

    // 如果本地没有云分类，执行全量同步 (可能是首次同步)
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

    // 提供选择本地已知分类或全部同步的选项
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

        // 检查是否选择了"全部"选项
        if (selectedOption.includes(allOption)) {
          progress.report({ message: "Syncing all categories..." });
          result = await gitlabService.syncFromGitLab();
        } else {
          // 仅同步选定的分类
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
