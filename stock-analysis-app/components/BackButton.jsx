"use client";

import { useRouter } from "next/navigation";

export default function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition mb-4"
    >
      <span className="text-lg">←</span> Back
    </button>
  );
}
