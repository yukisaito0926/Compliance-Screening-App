"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

export function DownloadPdfButton({ checkId }: { checkId: string }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleDownload = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/export-pdf/${checkId}`);
      if (!res.ok) {
        alert("PDFの生成に失敗しました");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // ファイル名はサーバー側のContent-Dispositionに従う
      a.download = "";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} disabled={isLoading}>
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          生成中...
        </>
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" />
          PDFダウンロード
        </>
      )}
    </Button>
  );
}
