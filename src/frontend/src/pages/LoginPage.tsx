import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, Eye, EyeOff, Lock, User } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { AuthState } from "../hooks/useAuth";

interface LoginPageProps {
  auth: AuthState;
}

export function LoginPage({ auth }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter username and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const err = await auth.login(username.trim(), password);
    setSubmitting(false);
    if (err) setError(err);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      {/* Card */}
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-lg p-8 space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              Crypto<span className="text-primary">Screener</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Sign in to access the screener
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label
              htmlFor="username"
              className="text-xs font-medium text-muted-foreground"
            >
              Username
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                id="username"
                data-ocid="login.username.input"
                type="text"
                autoComplete="username"
                autoFocus
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-9 bg-secondary border-border h-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="password"
              className="text-xs font-medium text-muted-foreground"
            >
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                id="password"
                data-ocid="login.password.input"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 pr-9 bg-secondary border-border h-10"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p
              data-ocid="login.error_state"
              role="alert"
              className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
            >
              {error}
            </p>
          )}

          <Button
            data-ocid="login.submit_button"
            type="submit"
            className="w-full h-10 font-semibold"
            disabled={submitting || auth.isLoading}
          >
            {submitting ? "Signing in…" : "Sign In"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Contact your admin for login credentials
        </p>
      </div>

      {/* Footer */}
      <p className="mt-6 text-xs text-muted-foreground">
        © {new Date().getFullYear()}. Built with love using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          caffeine.ai
        </a>
      </p>
    </div>
  );
}
