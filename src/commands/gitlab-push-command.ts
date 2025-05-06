/** @format */

import * as vscode from "vscode";
import { GitlabClient } from "../services/gitlab-service";
import { LocalMemoService } from "../services/local-data-service";
import { MemoItem } from "../models/memo-item";

/**
 * Creates a "Push to GitLab" command handler
 * @param gitlabService GitLab service client
 * @param localMemoService Local memo service
 * @returns "Push to GitLab" command handler
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

    // Group commands by category for display
    const quickPickItems: (vscode.QuickPickItem & {
      command?: MemoItem;
      isSeparator?: boolean;
    })[] = [];

    // Create a mapping of category to commands for display
    const commandsByCategory: { [category: string]: MemoItem[] } = {};
    localCommands.forEach((cmd) => {
      if (!commandsByCategory[cmd.category]) {
        commandsByCategory[cmd.category] = [];
      }
      commandsByCategory[cmd.category].push(cmd);
    });

    // Sort categories for display
    const sortedCategories = Object.keys(commandsByCategory).sort();

    sortedCategories.forEach((category) => {
      // Add category title as a separator
      quickPickItems.push({
        label: `$(folder) ${category}`,
        kind: vscode.QuickPickItemKind.Separator,
        isSeparator: true,
      });

      // Add all commands in this category
      commandsByCategory[category].forEach((cmd) => {
        quickPickItems.push({
          label: `$(terminal) ${cmd.alias || cmd.label}`,
          description: cmd.category,
          detail:
            cmd.command.length > 60
              ? `${cmd.command.substring(0, 60)}...`
              : cmd.command,
          command: cmd,
        });
      });
    });

    const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: "Select commands to push to GitLab",
      canPickMany: true,
    });

    if (!selectedItems || selectedItems.length === 0) {
      return;
    }

    // Filter out separator items and only keep actual command items
    const commandsToUpload = selectedItems
      .filter((item) => !item.isSeparator && item.command)
      .map((item) => item.command!);

    if (commandsToUpload.length === 0) {
      vscode.window.showInformationMessage("No commands selected");
      return;
    }

    const categories = [
      ...new Set(commandsToUpload.map((cmd) => cmd.category)),
    ];

    // Confirm upload
    const confirmMessage = `Confirm upload ${commandsToUpload.length} commands?`;
    const confirmResult = await vscode.window.showInformationMessage(
      confirmMessage,
      { modal: true },
      "Confirm Upload"
    );

    if (confirmResult !== "Confirm Upload") {
      return;
    }

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
