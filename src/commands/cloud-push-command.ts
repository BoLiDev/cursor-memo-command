/** @format */

import * as vscode from "vscode";
import { CloudService } from "../services/cloud-service";
import { LocalService } from "../services/local-service";
import { Prompt } from "../models/prompt";
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
  cloudStoreService: CloudService,
  localMemoService: LocalService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async () => {
    const localPrompts = localMemoService.getPrompts();

    if (localPrompts.length === 0) {
      await uiService.showInformationMessage(
        "No local prompts available to push"
      );
      return;
    }

    // Define type for QuickPick items that hold MemoItem data
    type MemoQuickPickItem = QuickPickItem & {
      prompt?: Prompt;
      isSeparator?: boolean;
    };

    // Group prompts by category for display
    const quickPickItems: MemoQuickPickItem[] = [];

    // Create a mapping of category to prompts for display
    const promptsByCategory: { [categoryId: string]: Prompt[] } = {};
    const categoryMap = new Map(
      localMemoService.getCategories().map((cat) => [cat.id, cat.name])
    );

    localPrompts.forEach((prompt) => {
      if (!promptsByCategory[prompt.categoryId]) {
        promptsByCategory[prompt.categoryId] = [];
      }
      promptsByCategory[prompt.categoryId].push(prompt);
    });

    // Sort categories by name for display
    const sortedCategoryIds = Object.keys(promptsByCategory).sort((a, b) => {
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

      // Add all prompts in this category
      promptsByCategory[categoryId].forEach((prompt) => {
        quickPickItems.push({
          label: `$(terminal) ${prompt.alias || prompt.label}`,
          description: categoryName,
          detail:
            prompt.content.length > 60
              ? `${prompt.content.substring(0, 60)}...`
              : prompt.content,
          prompt: prompt,
        });
      });
    });

    const selectedItems = await uiService.showQuickPick(quickPickItems, {
      placeHolder: "Select prompts to push to GitLab",
      canPickMany: true,
    });

    if (!selectedItems || selectedItems.length === 0) {
      return;
    }

    // Filter out separator items and only keep actual prompt items
    const promptsToUpload = selectedItems
      .filter(
        (item): item is MemoQuickPickItem & { prompt: Prompt } =>
          !item.isSeparator && !!item.prompt
      )
      .map((item) => item.prompt);

    if (promptsToUpload.length === 0) {
      await uiService.showInformationMessage("No prompts selected");
      return;
    }

    // Get unique category IDs involved
    const involvedCategoryIds = [
      ...new Set(promptsToUpload.map((cmd) => cmd.categoryId)),
    ];
    // Get category names for the message
    const involvedCategoryNames = involvedCategoryIds.map(
      (id) => categoryMap.get(id) || id
    );

    // Confirm upload
    const confirmMessage = `Push ${promptsToUpload.length} prompt(s) from categories [${involvedCategoryNames.join(", ")}] to GitLab as a new Merge Request?`;
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
        progress.report({ message: "Preparing prompts..." });

        try {
          progress.report({ message: "Creating merge request..." });

          // Pass category IDs to the service
          const result = await cloudStoreService.pushPromptsToGitLab(
            promptsToUpload,
            involvedCategoryIds
          );

          if (result.success) {
            const openMrAction = { title: "Open Merge Request" };
            const message = `Successfully pushed ${result.data.pushedPrompts} prompts to GitLab as a merge request.`;

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
