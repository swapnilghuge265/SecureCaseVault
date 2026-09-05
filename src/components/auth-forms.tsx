"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Spinner } from "./ui";
import { IconAlert } from "./icons";

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300"
      role="alert"
    >
      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        className="input pr-11"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
      />
      <button
        type="button"
        onClick={() => setShow((current) => !current)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-mut transition-colors hover:text-ink"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function getPasswordStrength(password: string) {
  if (!password) {
    return {
      score: 0,
      label: "",
      width: "0%",
    };
  }

  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) {
    return {
      score,
      label: "Weak",
      width: "33%",
    };
  }

  if (score <= 4) {
    return {
      score,
      label: "Medium",
      width: "66%",
    };
  }

  return {
    score,
    label: "Strong",
    width: "100%",
  };
}

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      let data: { error?: string } = {};

      try {
        data = await res.json();
      } catch {
        // Keep the default error if the response is not JSON.
      }

      if (!res.ok) {
        setError(data.error ?? "Sign-in failed. Please try again.");
        return;
      }

      // Authentication is handled by the secure HttpOnly session cookie.
      // The session token is never exposed to the browser JavaScript.
      window.location.href = "/dashboard";
    } catch {
      setError(
        "Could not reach the server. Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-7">
      <h2 className="font-display text-xl font-semibold tracking-tight">
        Sign in
      </h2>

      <p className="mt-1 text-sm text-mut">
        Enter your credentials to access the console.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {error && <ErrorBox message={error} />}

        <div>
          <label className="label" htmlFor="login-username">
            Username
          </label>

          <input
            id="login-username"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="login-password">
            Password
          </label>

          <PasswordInput
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••"
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={loading}
        >
          {loading ? <Spinner /> : null}
          {loading ? "Verifying…" : "Sign in securely"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-mut">
        No account yet?{" "}
        <Link
          href="/register"
          className="font-semibold text-cyan-300 hover:text-cyan-200"
        >
          Register
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
    confirm: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({
        ...current,
        [key]: e.target.value,
      }));

  const passwordStrength = getPasswordStrength(form.password);

  function validate(): string {
    if (form.fullName.trim().length < 2) {
      return "Please enter your full name.";
    }

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(form.username)) {
      return "Username must be 3–24 characters: letters, numbers or underscores.";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      return "Please enter a valid email address.";
    }

    if (form.password.length < 8) {
      return "Password must be at least 8 characters.";
    }

    if (!/[a-zA-Z]/.test(form.password) || !/\d/.test(form.password)) {
      return "Password must contain both letters and numbers.";
    }

    if (form.password !== form.confirm) {
      return "Passwords do not match.";
    }

    return "";
  }

  async function submit(e: FormEvent) {
    e.preventDefault();

    const problem = validate();

    if (problem) {
      setError(problem);
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          username: form.username,
          email: form.email.trim().toLowerCase(),
          password: form.password,
        }),
      });

      let data: { error?: string } = {};

      try {
        data = await res.json();
      } catch {
        // Keep the default error if the response is not JSON.
      }

      if (!res.ok) {
        setError(data.error ?? "Registration failed. Please try again.");
        return;
      }

      // The server creates the secure HttpOnly session cookie.
      // No session token is returned to client-side JavaScript.
      window.location.href = "/dashboard";
    } catch {
      setError(
        "Could not reach the server. Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-7">
      <h2 className="font-display text-xl font-semibold tracking-tight">
        Create your account
      </h2>

      <p className="mt-1 text-sm text-mut">
        New accounts start with{" "}
        <span className="font-semibold text-ink">Viewer</span> access.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {error && <ErrorBox message={error} />}

        <div>
          <label className="label" htmlFor="reg-name">
            Full name
          </label>

          <input
            id="reg-name"
            className="input"
            value={form.fullName}
            onChange={set("fullName")}
            placeholder="Jordan Ellis"
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="reg-username">
              Username
            </label>

            <input
              id="reg-username"
              className="input"
              value={form.username}
              onChange={set("username")}
              placeholder="j.ellis"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="reg-email">
              Email
            </label>

            <input
              id="reg-email"
              type="email"
              className="input"
              value={form.email}
              onChange={set("email")}
              placeholder="j.ellis@example.com"
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="reg-password">
              Password
            </label>

            <PasswordInput
              id="reg-password"
              value={form.password}
              onChange={set("password")}
              placeholder="Min. 8 chars"
              autoComplete="new-password"
            />

            {form.password && (
              <div className="mt-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-field">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-all duration-300"
                    style={{ width: passwordStrength.width }}
                  />
                </div>

                <p className="mt-1 text-xs text-mut-2">
                  Password strength:{" "}
                  <span className="font-semibold text-ink">
                    {passwordStrength.label}
                  </span>
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="label" htmlFor="reg-confirm">
              Confirm password
            </label>

            <PasswordInput
              id="reg-confirm"
              value={form.confirm}
              onChange={set("confirm")}
              placeholder="Repeat password"
              autoComplete="new-password"
            />

            {form.confirm && (
              <p
                className={`mt-2 text-xs ${
                  form.password === form.confirm
                    ? "text-emerald-300"
                    : "text-rose-300"
                }`}
              >
                {form.password === form.confirm
                  ? "Passwords match"
                  : "Passwords do not match"}
              </p>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={loading}
        >
          {loading ? <Spinner /> : null}
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-mut">
        Already registered?{" "}
        <Link
          href="/login"
          className="font-semibold text-cyan-300 hover:text-cyan-200"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}