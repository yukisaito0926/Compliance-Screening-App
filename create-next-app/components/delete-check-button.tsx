"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";

export function DeleteCheckButton({ checkId }: { checkId: string }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("このチェック結果を削除しますか？\n（監査対応のためDBには残ります）")) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/compliance-check/${checkId}`, {
        method: "DELETE",
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        alert(data.error ?? "削除に失敗しました");
        return;
      }
      // フルリロードで確実に一覧を更新
      window.location.href = "/protected/history";
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
    >
      {isDeleting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
      <span className="ml-1.5">削除</span>
    </Button>
  );
}
