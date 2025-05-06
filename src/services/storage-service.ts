/** @format */

import * as vscode from "vscode";

/**
 * Service for abstracting interactions with VS Code's storage (globalState and secrets).
 */
export class StorageService {
  constructor(private context: vscode.ExtensionContext) {}

  // --- Global State Methods ---

  /**
   * Retrieve a value from global state storage.
   * @param key The key of the value to retrieve.
   * @param defaultValue The default value to return if the key doesn't exist.
   * @returns The retrieved value or the default value.
   */
  public getValue<T>(key: string, defaultValue: T): T {
    return this.context.globalState.get<T>(key, defaultValue);
  }

  /**
   * Store a value in global state storage.
   * @param key The key under which to store the value.
   * @param value The value to store.
   * @returns A promise that resolves when the value has been stored.
   */
  public async setValue<T>(key: string, value: T): Promise<void> {
    await this.context.globalState.update(key, value);
  }

  // --- Secret Storage Methods ---

  /**
   * Retrieve a secret from secure storage.
   * @param key The key of the secret to retrieve.
   * @returns A promise that resolves with the secret string, or undefined if not found.
   */
  public async getSecret(key: string): Promise<string | undefined> {
    return await this.context.secrets.get(key);
  }

  /**
   * Store a secret securely.
   * @param key The key under which to store the secret.
   * @param value The secret value to store.
   * @returns A promise that resolves when the secret has been stored.
   */
  public async setSecret(key: string, value: string): Promise<void> {
    await this.context.secrets.store(key, value);
  }

  /**
   * Delete a secret from secure storage.
   * @param key The key of the secret to delete.
   * @returns A promise that resolves when the secret has been deleted.
   */
  public async deleteSecret(key: string): Promise<void> {
    await this.context.secrets.delete(key);
  }
}
