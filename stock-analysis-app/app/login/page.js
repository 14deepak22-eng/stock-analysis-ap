"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("signin");
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      setMessage(error ? error.message : "Check your email to confirm your account.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
      } else {
        router.push("/");
      }
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <div className="card p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">{mode === "signup" ? "🚀" : "👋"}</div>
          <h1 className="text-xl font-bold">
            {mode === "signup" ? "Create an account" : "Welcome back"}
          </h1>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border rounded-xl px-4 py-3 focus:border-indigo-400 outline-none transition"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border rounded-xl px-4 py-3 focus:border-indigo-400 outline-none transition"
            required
          />
          <button type="submit" className="btn-primary rounded-xl px-4 py-3 mt-1">
            {mode === "signup" ? "Sign up" : "Sign in"}
          </button>
        </form>

        {message && <p className="text-sm text-gray-500 mt-4 text-center">{message}</p>}

        <button
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="text-sm text-indigo-600 hover:underline mt-5 w-full text-center"
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}
