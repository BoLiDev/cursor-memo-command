/** @format */

import * as vscode from "vscode";
import { GitlabClient } from "../services/gitlab-service";
import { LocalMemoService } from "../services/local-data-service";
import { MemoTreeDataProvider } from "../view/tree-provider";
import { MemoItem } from "../models/memo-item";

/**
 * 创建"推送到 GitLab"命令处理器
 * @param gitlabService GitLab 服务客户端
 * @param localMemoService 本地 memo 服务
 * @param memoTreeProvider memo 树形数据提供者
 * @returns "推送到 GitLab"命令处理函数
 */
export function createPushToGitLabHandler(
  gitlabService: GitlabClient,
  localMemoService: LocalMemoService
): (...args: any[]) => Promise<void> {
  return async () => {
    const localCommands = localMemoService.getCommands();

    if (localCommands.length === 0) {
      vscode.window.showInformationMessage(
        "No local commands available to push"
      );
      return;
    }

    const selectedCommands = await vscode.window.showQuickPick(
      localCommands.map((cmd) => ({
        label: cmd.alias || cmd.label,
        description: cmd.category,
        detail:
          cmd.command.length > 60
            ? `${cmd.command.substring(0, 60)}...`
            : cmd.command,
        command: cmd,
      })),
      {
        placeHolder: "Select commands to push to GitLab",
        canPickMany: true,
      }
    );

    if (!selectedCommands || selectedCommands.length === 0) {
      return;
    }

    const commandsToUpload = selectedCommands.map((item) => item.command);
    const categories = [
      ...new Set(commandsToUpload.map((cmd) => cmd.category)),
    ];

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Pushing to GitLab",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Preparing commands..." });

        try {
          progress.report({ message: "Creating merge request..." });
          const result = await gitlabService.pushCommandsToGitLab(
            commandsToUpload,
            categories
          );

          if (result.success) {
            const openMrAction = "Open Merge Request";
            const message = `Successfully pushed ${result.pushedCommands} commands to GitLab as a merge request.`;

            const selection = await vscode.window.showInformationMessage(
              message,
              openMrAction
            );

            if (selection === openMrAction && result.mergeRequestUrl) {
              vscode.env.openExternal(vscode.Uri.parse(result.mergeRequestUrl));
            }
          } else {
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
