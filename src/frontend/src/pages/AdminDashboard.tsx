import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useActor } from "@caffeineai/core-infrastructure";
import {
  ArrowLeft,
  Edit2,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Trash2,
  UserCircle2,
  Users,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { createActor } from "../backend";
import type { UserInfo } from "../backend";
import { Role } from "../backend";
import type { AuthState } from "../hooks/useAuth";

interface AdminDashboardProps {
  auth: AuthState;
  onBack: () => void;
}

interface EditState {
  originalUsername: string;
  username: string;
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
}

export function AdminDashboard({ auth, onBack }: AdminDashboardProps) {
  const { actor } = useActor(createActor);

  // ── User list ──────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Edit state ─────────────────────────────────────────────────────────────
  const [editState, setEditState] = useState<EditState | null>(null);

  const loadUsers = useCallback(async () => {
    if (!actor || !auth.token) return;
    setListError(null);
    try {
      const result = await actor.listUsers(auth.token);
      if (result.__kind__ === "ok") {
        setUsers(
          result.ok
            .slice()
            .sort((a, b) => a.username.localeCompare(b.username)),
        );
      } else {
        setListError(result.err);
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load users");
    }
  }, [actor, auth.token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handleDelete(username: string) {
    if (!actor || !auth.token) return;
    setDeleteError(null);
    try {
      const result = await actor.deleteUser(auth.token, username);
      if (result.__kind__ === "ok") {
        setUsers((prev) => prev.filter((u) => u.username !== username));
      } else {
        setDeleteError(result.err);
      }
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete user");
    }
  }

  function openEdit(u: UserInfo) {
    setEditState({
      originalUsername: u.username,
      username: u.username,
      password: "",
      confirmPassword: "",
      showPassword: false,
      saving: false,
      error: null,
      success: null,
    });
  }

  function closeEdit() {
    setEditState(null);
  }

  async function handleEditSave(e: FormEvent) {
    e.preventDefault();
    if (!editState || !actor || !auth.token) return;

    const { originalUsername, username, password, confirmPassword } = editState;

    if (!username.trim()) {
      setEditState((s) => s && { ...s, error: "Username cannot be empty." });
      return;
    }

    if (password && password !== confirmPassword) {
      setEditState((s) => s && { ...s, error: "Passwords do not match." });
      return;
    }

    if (password && password.length < 6) {
      setEditState(
        (s) => s && { ...s, error: "Password must be at least 6 characters." },
      );
      return;
    }

    setEditState((s) => s && { ...s, saving: true, error: null });

    try {
      const result = await actor.updateUser(
        auth.token,
        originalUsername,
        username.trim(),
        password || "",
      );
      if (result.__kind__ === "ok") {
        setEditState(
          (s) =>
            s && { ...s, saving: false, success: "User updated successfully." },
        );
        await loadUsers();
        // Auto-close after short delay to show success
        setTimeout(() => setEditState(null), 1200);
      } else {
        setEditState((s) => s && { ...s, saving: false, error: result.err });
      }
    } catch (err) {
      setEditState(
        (s) =>
          s && {
            ...s,
            saving: false,
            error: err instanceof Error ? err.message : "Failed to update user",
          },
      );
    }
  }

  // ── Create user ───────────────────────────────────────────────────────────
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!actor || !auth.token) return;
    if (!newUsername.trim() || !newPassword.trim()) {
      setCreateError("Username and password are required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const result = await actor.createUser(
        auth.token,
        newUsername.trim(),
        newPassword,
      );
      if (result.__kind__ === "ok") {
        setCreateSuccess(`User "${newUsername.trim()}" created.`);
        setNewUsername("");
        setNewPassword("");
        await loadUsers();
      } else {
        setCreateError(result.err);
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  // ── Change own password ───────────────────────────────────────────────────
  const [oldPassword, setOldPassword] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [changingPw, setChangingPw] = useState(false);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!newPass || newPass !== confirmPass) {
      setPwError("New passwords do not match.");
      return;
    }
    if (newPass.length < 6) {
      setPwError("New password must be at least 6 characters.");
      return;
    }
    setChangingPw(true);
    setPwError(null);
    setPwSuccess(null);
    const err = await auth.changePassword(oldPassword, newPass);
    setChangingPw(false);
    if (err) {
      setPwError(err);
    } else {
      setPwSuccess("Password changed successfully.");
      setOldPassword("");
      setNewPass("");
      setConfirmPass("");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center gap-3 px-6 py-3 bg-card border-b border-border shadow-sm">
        <button
          type="button"
          data-ocid="admin.back.button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to screener"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground">Admin Dashboard</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <UserCircle2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {auth.user?.username}
          </span>
          <Badge variant="secondary" className="text-xs">
            admin
          </Badge>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* ── User List ─────────────────────────────────────────────────── */}
        <section
          data-ocid="admin.users.section"
          className="bg-card border border-border rounded-xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">All Users</h2>
            <Badge variant="outline" className="ml-auto text-xs">
              {users.length}
            </Badge>
          </div>

          {listError && (
            <div
              data-ocid="admin.users.error_state"
              className="mx-5 mt-4 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
            >
              {listError}
            </div>
          )}
          {deleteError && (
            <div
              data-ocid="admin.delete.error_state"
              className="mx-5 mt-4 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
            >
              {deleteError}
            </div>
          )}

          {users.length === 0 && !listError ? (
            <div
              data-ocid="admin.users.empty_state"
              className="px-5 py-10 text-center text-sm text-muted-foreground"
            >
              No users yet. Create one below.
            </div>
          ) : (
            <ul data-ocid="admin.users.list" className="divide-y divide-border">
              {users.map((u, i) => (
                <li
                  key={u.username}
                  data-ocid={`admin.users.item.${i + 1}`}
                  className="flex flex-col"
                >
                  {/* User row */}
                  <div className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-bold text-foreground uppercase shrink-0">
                      {u.username.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {u.username}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {u.role === Role.admin
                          ? "Administrator"
                          : "Normal User"}
                      </p>
                    </div>
                    <Badge
                      variant={u.role === Role.admin ? "default" : "secondary"}
                      className="text-xs shrink-0"
                    >
                      {u.role === Role.admin ? "admin" : "user"}
                    </Badge>
                    {/* Protect: don't allow editing/deleting own account */}
                    {u.username !== auth.user?.username && (
                      <>
                        <Button
                          data-ocid={`admin.users.edit_button.${i + 1}`}
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 text-primary hover:text-primary hover:bg-primary/10 shrink-0"
                          onClick={() =>
                            editState?.originalUsername === u.username
                              ? closeEdit()
                              : openEdit(u)
                          }
                          aria-label={`Edit ${u.username}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          data-ocid={`admin.users.delete_button.${i + 1}`}
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => handleDelete(u.username)}
                          aria-label={`Delete ${u.username}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Inline edit form — shown only for the user being edited */}
                  {editState?.originalUsername === u.username && (
                    <form
                      data-ocid={`admin.users.edit_form.${i + 1}`}
                      onSubmit={handleEditSave}
                      className="mx-5 mb-4 bg-secondary/40 border border-border rounded-lg px-4 py-4 space-y-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                          Edit User
                        </p>
                        <button
                          type="button"
                          aria-label="Cancel edit"
                          onClick={closeEdit}
                          data-ocid={`admin.users.edit_cancel.${i + 1}`}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Username */}
                        <div className="space-y-1">
                          <Label
                            htmlFor={`edit-username-${i}`}
                            className="text-xs text-muted-foreground"
                          >
                            Username
                          </Label>
                          <Input
                            id={`edit-username-${i}`}
                            data-ocid={`admin.users.edit_username.${i + 1}`}
                            type="text"
                            value={editState.username}
                            onChange={(e) =>
                              setEditState(
                                (s) => s && { ...s, username: e.target.value },
                              )
                            }
                            className="bg-background border-border h-8 text-sm"
                          />
                        </div>

                        {/* New password */}
                        <div className="space-y-1">
                          <Label
                            htmlFor={`edit-password-${i}`}
                            className="text-xs text-muted-foreground"
                          >
                            New Password{" "}
                            <span className="text-muted-foreground/60">
                              (optional)
                            </span>
                          </Label>
                          <div className="relative">
                            <Input
                              id={`edit-password-${i}`}
                              data-ocid={`admin.users.edit_password.${i + 1}`}
                              type={
                                editState.showPassword ? "text" : "password"
                              }
                              placeholder="Leave blank to keep"
                              value={editState.password}
                              onChange={(e) =>
                                setEditState(
                                  (s) =>
                                    s && { ...s, password: e.target.value },
                                )
                              }
                              className="bg-background border-border h-8 text-sm pr-8"
                            />
                            <button
                              type="button"
                              aria-label={
                                editState.showPassword ? "Hide" : "Show"
                              }
                              onClick={() =>
                                setEditState(
                                  (s) =>
                                    s && {
                                      ...s,
                                      showPassword: !s.showPassword,
                                    },
                                )
                              }
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {editState.showPassword ? (
                                <EyeOff className="w-3 h-3" />
                              ) : (
                                <Eye className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Confirm password */}
                        <div className="space-y-1">
                          <Label
                            htmlFor={`edit-confirm-${i}`}
                            className="text-xs text-muted-foreground"
                          >
                            Confirm Password
                          </Label>
                          <Input
                            id={`edit-confirm-${i}`}
                            data-ocid={`admin.users.edit_confirm.${i + 1}`}
                            type="password"
                            placeholder="Repeat new password"
                            value={editState.confirmPassword}
                            onChange={(e) =>
                              setEditState(
                                (s) =>
                                  s && {
                                    ...s,
                                    confirmPassword: e.target.value,
                                  },
                              )
                            }
                            className="bg-background border-border h-8 text-sm"
                          />
                        </div>
                      </div>

                      {editState.error && (
                        <p
                          data-ocid={`admin.users.edit_error.${i + 1}`}
                          className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-1.5"
                        >
                          {editState.error}
                        </p>
                      )}
                      {editState.success && (
                        <p
                          data-ocid={`admin.users.edit_success.${i + 1}`}
                          className="text-xs text-emerald-600 bg-emerald-50/50 border border-emerald-200/40 rounded px-2 py-1.5"
                        >
                          {editState.success}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          data-ocid={`admin.users.edit_save.${i + 1}`}
                          type="submit"
                          size="sm"
                          disabled={editState.saving}
                          className="h-7 text-xs gap-1"
                        >
                          {editState.saving ? "Saving…" : "Save Changes"}
                        </Button>
                        <Button
                          data-ocid={`admin.users.edit_cancel_button.${i + 1}`}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={closeEdit}
                          className="h-7 text-xs text-muted-foreground"
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Create User ──────────────────────────────────────────────── */}
        <section
          data-ocid="admin.create_user.section"
          className="bg-card border border-border rounded-xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Create New User</h2>
          </div>

          <form onSubmit={handleCreate} className="px-5 py-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="new-username"
                  className="text-xs text-muted-foreground"
                >
                  Username
                </Label>
                <Input
                  id="new-username"
                  data-ocid="admin.create_user.username.input"
                  type="text"
                  placeholder="Enter username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="bg-secondary border-border h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="new-password"
                  className="text-xs text-muted-foreground"
                >
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    data-ocid="admin.create_user.password.input"
                    type={showNewPass ? "text" : "password"}
                    placeholder="Enter password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-secondary border-border h-9 text-sm pr-9"
                  />
                  <button
                    type="button"
                    aria-label={showNewPass ? "Hide" : "Show"}
                    onClick={() => setShowNewPass((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPass ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {createError && (
              <p
                data-ocid="admin.create_user.error_state"
                className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
              >
                {createError}
              </p>
            )}
            {createSuccess && (
              <p
                data-ocid="admin.create_user.success_state"
                className="text-xs text-success bg-success-bg border border-success/20 rounded-lg px-3 py-2"
              >
                {createSuccess}
              </p>
            )}

            <Button
              data-ocid="admin.create_user.submit_button"
              type="submit"
              size="sm"
              disabled={creating}
              className="gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {creating ? "Creating…" : "Create User"}
            </Button>
          </form>
        </section>

        {/* ── Change Own Password ───────────────────────────────────────── */}
        <section
          data-ocid="admin.change_password.section"
          className="bg-card border border-border rounded-xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">
              Change My Password
            </h2>
          </div>

          <form onSubmit={handleChangePassword} className="px-5 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="old-password"
                className="text-xs text-muted-foreground"
              >
                Current Password
              </Label>
              <div className="relative max-w-xs">
                <Input
                  id="old-password"
                  data-ocid="admin.change_password.old.input"
                  type={showOld ? "text" : "password"}
                  placeholder="Current password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="bg-secondary border-border h-9 text-sm pr-9"
                />
                <button
                  type="button"
                  aria-label="Toggle visibility"
                  onClick={() => setShowOld((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showOld ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="new-pass"
                  className="text-xs text-muted-foreground"
                >
                  New Password
                </Label>
                <div className="relative">
                  <Input
                    id="new-pass"
                    data-ocid="admin.change_password.new.input"
                    type={showNew ? "text" : "password"}
                    placeholder="New password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="bg-secondary border-border h-9 text-sm pr-9"
                  />
                  <button
                    type="button"
                    aria-label="Toggle visibility"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNew ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="confirm-pass"
                  className="text-xs text-muted-foreground"
                >
                  Confirm New Password
                </Label>
                <Input
                  id="confirm-pass"
                  data-ocid="admin.change_password.confirm.input"
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="bg-secondary border-border h-9 text-sm"
                />
              </div>
            </div>

            {pwError && (
              <p
                data-ocid="admin.change_password.error_state"
                className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
              >
                {pwError}
              </p>
            )}
            {pwSuccess && (
              <p
                data-ocid="admin.change_password.success_state"
                className="text-xs text-success bg-success-bg border border-success/20 rounded-lg px-3 py-2"
              >
                {pwSuccess}
              </p>
            )}

            <Button
              data-ocid="admin.change_password.submit_button"
              type="submit"
              size="sm"
              disabled={changingPw}
              className="gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {changingPw ? "Updating…" : "Update Password"}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
