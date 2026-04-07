import { AsyncHooks, AsyncHookType, FunctionHookType, Hooks } from "../models/hooks";
export declare class HookManager {
    private readonly _hooks;
    private readonly _asyncHooks;
    private enableHooks;
    constructor(enableHooks?: boolean);
    /**
     * Registers a new hook to be called when the corresponding checkHook() call is executed.
     * @param hookName The name of the hook
     * @param hook The function to be called when the hook is executed.
     */
    hook(hookName: Hooks, hook: (...args: any) => FunctionHookType): void;
    /**
     * Registers a new hook to be called when the corresponding checkAsyncHook() call is executed.
     * @param hookName The name of the async hook.
     * @param hook The function to be called when the hook is executed.
     */
    hookAsync(hookName: AsyncHooks, hook: (...args: any) => AsyncHookType): void;
    /**
     * Calls all hooks currently registered and either halts or continues the
     * function based on the return behavior of each hook.
     * @param hookName The name of the async hook
     * @param hook The function to be called when the hook is executed.
     * @returns Returns the value of the first hook to return a boolean, or true.
     */
    checkHook(hookName: Hooks, ...args: any): boolean;
    /**
     * Calls all async hooks currently registered and either halts or continues the
     * function based on the return behavior of each hook.
     * @param hookName The name of the async hook.
     * @param hook The function to be called when the hook is executed.
     * @returns Returns the value of the first hook to return a boolean, or true.
     */
    checkAsyncHook(hookName: Hooks, ...args: any): Promise<boolean>;
}
