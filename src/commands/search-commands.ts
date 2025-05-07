/** @format */

import * as vscode from "vscode";
import { LocalService } from "../services/local-service";
import { CloudService } from "../services/cloud-service";
import { VSCodeUserInteractionService } from "../services/vscode-user-interaction-service";
import { Prompt } from "../models/prompt";
import { Category } from "../models/category";
import { isSamePrompt } from "../utils/prompt-utils";

interface PromptQuickPickItem extends vscode.QuickPickItem {
  promptObject: Prompt;
  source: "Local" | "Cloud" | "Cloud (Available)";
}

export function createSearchAllPromptsHandler(
  localService: LocalService,
  cloudService: CloudService,
  uiService: VSCodeUserInteractionService
): () => Promise<void> {
  return async () => {
    const quickPick = vscode.window.createQuickPick<
      PromptQuickPickItem | vscode.QuickPickItem
    >();
    quickPick.placeholder =
      "Search and select a prompt to paste (alias, category, local/cloud)";
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    const localPrompts = localService.getPrompts();
    const localCategories = localService.getCategories();
    const cloudPrompts = cloudService.getCloudPrompts(); // These are the locally synced cloud prompts

    const localCategoryMap = new Map<string, string>();
    localCategories.forEach((cat: Category) => {
      localCategoryMap.set(cat.id, cat.name);
    });

    const initialItems: (PromptQuickPickItem | vscode.QuickPickItem)[] = [];

    // Add local prompts
    localPrompts.forEach((prompt) => {
      const categoryName =
        localCategoryMap.get(prompt.categoryId) || "Unknown Category";
      initialItems.push({
        label: `$(library) [${categoryName}] ${prompt.alias || prompt.label}`,
        description:
          prompt.content.substring(0, 100) +
          (prompt.content.length > 100 ? "..." : ""),
        promptObject: prompt,
        source: "Local",
      });
    });

    // Add locally synced cloud prompts
    cloudPrompts.forEach((prompt) => {
      const categoryName = prompt.categoryId || "Unknown Category";
      initialItems.push({
        label: `$(cloud) [${categoryName}] ${prompt.alias || prompt.label}`,
        description:
          prompt.content.substring(0, 100) +
          (prompt.content.length > 100 ? "..." : ""),
        promptObject: prompt,
        source: "Cloud",
      });
    });

    if (initialItems.length === 0) {
      uiService.showInformationMessage(
        "No local or synced cloud prompts found. Loading available cloud prompts..."
      );
    }

    quickPick.items = initialItems;
    quickPick.show();

    // Asynchronously load all available cloud prompts from the source
    // Using fetchAvailableCategories for now, assuming a new method will be added to get all remote prompts.
    // For demonstration, I'll simulate fetching all remote prompts based on categories.
    // A proper implementation would require a dedicated method in CloudService.
    const loadingItem: vscode.QuickPickItem = {
      label: "$(sync~spin) Loading available cloud prompts...",
      alwaysShow: true,
    };
    quickPick.items = [...initialItems, loadingItem];

    try {
      const remoteDataResult = await cloudService.fetchAndParseTeamPrompts();

      if (remoteDataResult.success && remoteDataResult.data) {
        const allRemotePrompts: Prompt[] = remoteDataResult.data.prompts || [];

        const newRemoteItems: (PromptQuickPickItem | vscode.QuickPickItem)[] =
          [];

        allRemotePrompts.forEach((prompt: Prompt) => {
          // 用 isSamePrompt 判断是否已存在于本地已同步的 cloudPrompts
          const alreadySynced = cloudPrompts.some((localPrompt) =>
            isSamePrompt(prompt, localPrompt)
          );
          if (!alreadySynced) {
            newRemoteItems.push({
              kind: vscode.QuickPickItemKind.Separator,
              label: "Available in Cloud (Not Synced)",
            });
            newRemoteItems.push({
              label: `$(cloud-download) [${prompt.categoryId || CloudService.DEFAULT_CATEGORY}] ${prompt.alias || prompt.label}`,
              description:
                prompt.content.substring(0, 100) +
                (prompt.content.length > 100 ? "..." : ""),
              promptObject: prompt,
              source: "Cloud (Available)",
            });
          }
        });

        // Update the quick pick items dynamically, removing the loading item
        const currentItems = quickPick.items.filter(
          (item) => item !== loadingItem
        );
        if (newRemoteItems.length > 0) {
          quickPick.items = [...currentItems, ...newRemoteItems];
        } else {
          // If no new remote items and no initial items, show a message and close
          if (initialItems.length === 0) {
            uiService.showInformationMessage(
              "No prompts found in local, synced cloud, or available cloud."
            );
            quickPick.dispose();
          } else {
            // If there are initial items but no new remote items, just remove the loading item
            quickPick.items = currentItems;
            uiService.showInformationMessage(
              "No new prompts available in cloud."
            );
          }
        }
      } else if (remoteDataResult.success === false && remoteDataResult.error) {
        // Check for error explicitly
        // If fetching remote failed and no local/synced prompts, show error and close
        const currentItems = quickPick.items.filter(
          (item) => item !== loadingItem
        );
        quickPick.items = currentItems; // Remove loading indicator

        if (initialItems.length === 0) {
          uiService.showErrorMessage(
            `Failed to load available cloud prompts: ${remoteDataResult.error}`
          );
          quickPick.dispose();
        } else {
          // Show warning if fetch failed but there are initial items
          uiService.showWarningMessage(
            `Could not load all available cloud prompts: ${remoteDataResult.error}`
          );
        }
      } else {
        // Handle cases where success is true but data is missing or other unexpected results
        const currentItems = quickPick.items.filter(
          (item) => item !== loadingItem
        );
        quickPick.items = currentItems; // Remove loading indicator
        if (initialItems.length === 0) {
          uiService.showInformationMessage(
            "No prompts found in local, synced cloud, or available cloud."
          );
          quickPick.dispose();
        } else {
          uiService.showWarningMessage(
            "Could not load available cloud prompts."
          );
        }
      }
    } catch (error: any) {
      // Handle potential errors during remote fetching
      const currentItems = quickPick.items.filter(
        (item) => item !== loadingItem
      );
      quickPick.items = currentItems; // Remove loading indicator

      if (initialItems.length === 0) {
        uiService.showErrorMessage(
          `An error occurred while loading available cloud prompts: ${error.message}`
        );
        quickPick.dispose();
      } else {
        uiService.showWarningMessage(
          `An error occurred while loading available cloud prompts: ${error.message}`
        );
      }
    }

    quickPick.onDidAccept(async () => {
      const selectedItem = quickPick.selectedItems[0];
      if (selectedItem && "promptObject" in selectedItem) {
        // Check if it's a PromptQuickPickItem
        const promptItem = selectedItem as PromptQuickPickItem;
        if (promptItem.promptObject) {
          // Sync the prompt to local cloud
          await cloudService.addCloudPrompt(promptItem.promptObject);
          await uiService.writeCursorChat(promptItem.promptObject.content);
        }
      }
      quickPick.hide();
      quickPick.dispose();
    });

    quickPick.onDidHide(() => quickPick.dispose());
  };
}
