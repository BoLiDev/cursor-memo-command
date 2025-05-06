/** @format */

import * as vscode from "vscode";
import { GitlabClient } from "../services/gitlab-service";
import { LocalMemoService } from "../services/local-data-service";
import { MemoTreeDataProvider } from "../view/tree-provider";

/**
 * 创建"推送到 GitLab"命令处理器
 * @param gitlabService GitLab 服务客户端
 * @param localMemoService 本地 memo 服务
 * @param memoTreeProvider memo 树形数据提供者
 * @returns "推送到 GitLab"命令处理函数
 */
export function createPushToGitLabHandler(
  gitlabService: GitlabClient,
  localMemoService: LocalMemoService,
  memoTreeProvider: MemoTreeDataProvider
): (...args: any[]) => Promise<void> {
  return async () => {
    // 1. 获取本地分类列表
    const localCategories = localMemoService.getCategories();

    if (localCategories.length === 0) {
      vscode.window.showInformationMessage(
        "No local categories available to push"
      );
      return;
    }

    // 2. 让用户选择要推送的分类
    const selectedCategories = await vscode.window.showQuickPick(
      localCategories,
      {
        placeHolder: "Select categories to push to GitLab",
        canPickMany: true,
      }
    );

    if (!selectedCategories || selectedCategories.length === 0) {
      return; // 用户取消了操作
    }

    // 3. 显示进度提示，执行推送操作
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Pushing to GitLab",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Preparing commands..." });

        try {
          // 4. 执行推送操作
          progress.report({ message: "Creating merge request..." });
          const result = await gitlabService.pushSelectedToGitLab(
            selectedCategories,
            localMemoService
          );

          // 5. 处理结果
          if (result.success) {
            const openMrAction = "Open Merge Request";
            const message = `Successfully pushed ${result.pushedCommands} commands to GitLab as a merge request.`;

            // 显示成功消息并提供打开 MR 的按钮
            const selection = await vscode.window.showInformationMessage(
              message,
              openMrAction
            );

            // 如果用户点击了"打开合并请求"按钮
            if (selection === openMrAction && result.mergeRequestUrl) {
              vscode.env.openExternal(vscode.Uri.parse(result.mergeRequestUrl));
            }
          } else {
            // 显示错误消息
            vscode.window.showErrorMessage(
              `Error pushing to GitLab: ${result.error || "Unknown error"}`
            );
          }
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Exception during push to GitLab: ${error.message || "Unknown error"}`
          );
        }
      }
    );
  };
}
