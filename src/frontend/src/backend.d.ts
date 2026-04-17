import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export type UserId = bigint;
export type Timestamp = bigint;
export type CreateUserResult = {
    __kind__: "ok";
    ok: UserInfo;
} | {
    __kind__: "err";
    err: string;
};
export type SimpleResult = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: string;
};
export type SessionToken = string;
export type LoginResult = {
    __kind__: "ok";
    ok: SessionToken;
} | {
    __kind__: "err";
    err: string;
};
export interface UserInfo {
    id: UserId;
    username: string;
    createdAt: Timestamp;
    role: Role;
}
export enum Role {
    admin = "admin",
    user = "user"
}
export interface backendInterface {
    changePassword(token: SessionToken, oldPassword: string, newPassword: string): Promise<SimpleResult>;
    createUser(adminToken: SessionToken, username: string, password: string): Promise<CreateUserResult>;
    deleteUser(adminToken: SessionToken, username: string): Promise<SimpleResult>;
    getCurrentUser(token: SessionToken): Promise<UserInfo | null>;
    listUsers(adminToken: SessionToken): Promise<{
        __kind__: "ok";
        ok: Array<UserInfo>;
    } | {
        __kind__: "err";
        err: string;
    }>;
    login(username: string, password: string): Promise<LoginResult>;
    logout(token: SessionToken): Promise<SimpleResult>;
    updateUser(adminToken: SessionToken, username: string, newUsername: string, newPassword: string): Promise<SimpleResult>;
}
