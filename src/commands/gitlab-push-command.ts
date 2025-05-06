/** @format */

import * as vscode from "vscode";
import { CloudStoreService } from "../services/cloud-store-service";
import { LocalMemoService } from "../services/local-data-service";
import { MemoItem } from "../models/memo-item";
import { VSCodeUserInteractionService } from "../services/vscode-user-interaction-service";
import { QuickPickItem } from "vscode";

/**
 * Creates a "Push to GitLab" command handler
 * @param cloudStoreService Service managing cloud state and push operations
 * @param localMemoService Local memo service
 * @param uiService The user interaction service
 * @returns "Push to GitLab" command handler
 */
export function createPushToGitLabHandler(
  cloudStoreService: CloudStoreService,
  localMemoService: LocalMemoService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async () => {
    const localCommands = localMemoService.getCommands();

    if (localCommands.length === 0) {
      await uiService.showInformationMessage(
        "No local commands available to push"
      );
      return;
    }

    // Define type for QuickPick items that hold MemoItem data
    type MemoQuickPickItem = QuickPickItem & {
      command?: MemoItem;
      isSeparator?: boolean;
    };

    // Group commands by category for display
    const quickPickItems: MemoQuickPickItem[] = [];

    // Create a mapping of category to commands for display
    const commandsByCategory: { [categoryId: string]: MemoItem[] } = {};
    const categoryMap = new Map(
      localMemoService.getCategories().map((cat) => [cat.id, cat.name])
    );

    localCommands.forEach((cmd) => {
      if (!commandsByCategory[cmd.categoryId]) {
        commandsByCategory[cmd.categoryId] = [];
      }
      commandsByCategory[cmd.categoryId].push(cmd);
    });

    // Sort categories by name for display
    const sortedCategoryIds = Object.keys(commandsByCategory).sort((a, b) => {
      const nameA = categoryMap.get(a) || a;
      const nameB = categoryMap.get(b) || b;
      return nameA.localeCompare(nameB);
    });

    sortedCategoryIds.forEach((categoryId) => {
      const categoryName = categoryMap.get(categoryId) || categoryId;
      // Add category title as a separator
      quickPickItems.push({
        label: `$(folder) ${categoryName}`,
        kind: vscode.QuickPickItemKind.Separator,
        isSeparator: true,
      });

      // Add all commands in this category
      commandsByCategory[categoryId].forEach((cmd) => {
        quickPickItems.push({
          label: `$(terminal) ${cmd.alias || cmd.label}`,
          description: categoryName,
          detail:
            cmd.command.length > 60
              ? `${cmd.command.substring(0, 60)}...`
              : cmd.command,
          command: cmd,
        });
      });
    });

    const selectedItems = await uiService.showQuickPick(quickPickItems, {
      placeHolder: "Select commands to push to GitLab",
      canPickMany: true,
    });

    if (!selectedItems || selectedItems.length === 0) {
      return;
    }

    // Filter out separator items and only keep actual command items
    const commandsToUpload = selectedItems
      .filter(
        (item): item is MemoQuickPickItem & { command: MemoItem } =>
          !item.isSeparator && !!item.command
      )
      .map((item) => item.command);

    if (commandsToUpload.length === 0) {
      await uiService.showInformationMessage("No commands selected");
      return;
    }

    // Get unique category IDs involved
    const involvedCategoryIds = [
      ...new Set(commandsToUpload.map((cmd) => cmd.categoryId)),
    ];
    // Get category names for the message
    const involvedCategoryNames = involvedCategoryIds.map(
      (id) => categoryMap.get(id) || id
    );

    // Confirm upload
    const confirmMessage = `Push ${commandsToUpload.length} command(s) from categories [${involvedCategoryNames.join(", ")}] to GitLab as a new Merge Request?`;
    const confirmResultItem = await uiService.showInformationMessage(
      confirmMessage,
      { modal: true },
      { title: "Confirm Push" }
    );

    if (confirmResultItem?.title !== "Confirm Push") {
      return;
    }

    await uiService.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Pushing to GitLab",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Preparing commands..." });

        try {
          progress.report({ message: "Creating merge request..." });

          // Pass category IDs to the service
          const result = await cloudStoreService.pushCommandsToGitLab(
            commandsToUpload,
            involvedCategoryIds
          );

          if (result.success) {
            const openMrAction = { title: "Open Merge Request" };
            const message = `Successfully pushed ${result.data.pushedCommands} commands to GitLab as a merge request.`;

            const selection = await uiService.showInformationMessage(
              message,
              openMrAction
            );

            if (
              selection?.title === openMrAction.title &&
              result.data.mergeRequestUrl
            ) {
              await uiService.openExternal(
                vscode.Uri.parse(result.data.mergeRequestUrl)
              );
            }
          } else {
            if (result.needsAuth) {
              await uiService.showWarningMessage(
                "GitLab token is missing or invalid for push."
              );
              await uiService.executeCommand("cursor-memo.manageGitLabToken");
            } else {
              await uiService.showErrorMessage(
                `Error pushing to GitLab: ${result.error}`
              );
            }
          }
        } catch (error: any) {
          await uiService.showErrorMessage(
            `Unexpected error during push: ${error.message || "Unknown error"}`
          );
        }
      }
    );
  };
}
