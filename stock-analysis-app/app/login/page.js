"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("signin"); // "signin" or "signup"

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      setMessage(error ? error.message : "Check your email to confirm your account.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setMessage(error ? error.message : "Signed in successfully.");
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-12">
      <h1 className="text-xl font-medium mb-4">
        {mode === "signup" ? "Create an account" : "Sign in"}
      </h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border rounded-lg px-3 py-2"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border rounded-lg px-3 py-2"
          required
        />
        <button type="submit" className="bg-black text-white rounded-lg px-3 py-2">
          {mode === "signup" ? "Sign up" : "Sign in"}
        </button>
      </form>

      {message && <p className="text-sm text-gray-500 mt-3">{message}</p>}

      <button
        onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
        className="text-sm underline mt-4"
      >
        {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </div>
  );
}
