/** @format */

import * as vscode from "vscode";
import {
  CloudStoreService,
  CloudOperationResult,
} from "../services/cloud-store-service";
import { LocalMemoService } from "../services/local-data-service";
import { MemoItem } from "../models/memo-item";

/**
 * Creates a "Push to GitLab" command handler
 * @param cloudStoreService Service managing cloud state and push operations
 * @param localMemoService Local memo service
 * @returns "Push to GitLab" command handler
 */
export function createPushToGitLabHandler(
  cloudStoreService: CloudStoreService,
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
      if (!commandsByCategory[cmd.categoryId]) {
        commandsByCategory[cmd.categoryId] = [];
      }
      commandsByCategory[cmd.categoryId].push(cmd);
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
          description: cmd.categoryId,
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
      ...new Set(commandsToUpload.map((cmd) => cmd.categoryId)),
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

          const result = await cloudStoreService.pushCommandsToGitLab(
            commandsToUpload,
            categories
          );

          if (result.success) {
            const openMrAction = "Open Merge Request";
            const message = `Successfully pushed ${result.data.pushedCommands} commands to GitLab as a merge request.`;

            const selection = await vscode.window.showInformationMessage(
              message,
              openMrAction
            );

            if (selection === openMrAction && result.data.mergeRequestUrl) {
              vscode.env.openExternal(
                vscode.Uri.parse(result.data.mergeRequestUrl)
              );
            }
          } else {
            if (result.needsAuth) {
              vscode.window.showWarningMessage(
                "GitLab token is missing or invalid for push."
              );
              vscode.commands.executeCommand("cursor-memo.manageGitLabToken");
            } else {
              vscode.window.showErrorMessage(
                `Error pushing to GitLab: ${result.error}`
              );
            }
          }
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Unexpected error during push: ${error.message || "Unknown error"}`
          );
        }
      }
    );
  };
}
