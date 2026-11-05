import type { Action, RpcResult } from "./handler.ts";

type UserClient = {
  auth: { getUser: (jwt: string) => PromiseLike<{
    data: { user: { id: string } | null }; error: unknown;
  }> };
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
};
const names = { create: "stock_key_admin_create", list: "stock_key_admin_list", revoke: "stock_key_admin_revoke" };

export function createUserBackend(clientForUser: (jwt: string, signal: AbortSignal) => UserClient) {
  return {
    authenticate: async (jwt: string, signal: AbortSignal) => {
      const { data, error } = await clientForUser(jwt, signal).auth.getUser(jwt);
      return error ? null : data.user?.id ?? null;
    },
    execute: async (jwt: string, action: Action, args: Record<string, unknown>, signal: AbortSignal): Promise<RpcResult> => {
      return await clientForUser(jwt, signal).rpc(names[action], args);
    },
  };
}
